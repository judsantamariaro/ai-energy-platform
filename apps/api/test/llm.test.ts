import { describe, expect, it } from 'vitest';
import type { NarrativeProvider } from '@aiem/ai';
import type { AnomalyDetail, AnomalyListItem, AnalysisRun } from '@aiem/shared';
import { createLlmService, type LlmService } from '../src/llm/service.js';
import { createTestApp } from './helpers.js';

const silent = { info: () => {}, warn: () => {} };
const llmConfig = {
  mode: 'auto' as const,
  ollamaUrl: 'http://ollama.test',
  model: 'qwen2.5:3b',
  timeoutMs: 1000,
};

function fakeOllama(models: string[] | 'down') {
  return (async (url: string) => {
    if (models === 'down') throw new Error('ECONNREFUSED');
    if (url.endsWith('/api/tags')) {
      return new Response(JSON.stringify({ models: models.map((name) => ({ name })) }));
    }
    return new Response('{}');
  }) as unknown as typeof fetch;
}

describe('createLlmService (LLM_PROVIDER=auto)', () => {
  it('usa Ollama si responde y tiene el modelo', async () => {
    const llm = createLlmService(llmConfig, silent, fakeOllama(['qwen2.5:3b', 'llama3.2:3b']));
    expect(await llm.resolve()).toMatchObject({ name: 'ollama', model: 'qwen2.5:3b' });
    expect(llm.status()).toEqual({
      mode: 'auto',
      provider: 'ollama',
      model: 'qwen2.5:3b',
      available: true,
    });
  });

  it('usa plantillas si Ollama no tiene el modelo', async () => {
    const llm = createLlmService(llmConfig, silent, fakeOllama(['llama3.2:3b']));
    expect(await llm.resolve()).toBeNull();
    expect(llm.status().available).toBe(false);
  });

  it('usa plantillas si Ollama no responde, sin fallar', async () => {
    const llm = createLlmService(llmConfig, silent, fakeOllama('down'));
    expect(await llm.resolve()).toBeNull();
    await expect(llm.warmUp()).resolves.toBeUndefined();
  });

  it('LLM_PROVIDER=none nunca consulta a Ollama', async () => {
    const llm = createLlmService({ ...llmConfig, mode: 'none' }, silent, () => {
      throw new Error('no debería llamarse');
    });
    expect(await llm.resolve()).toBeNull();
  });
});

describe('análisis que falla', () => {
  it('queda FAILED con la etapa que falló marcada, y la API sigue respondiendo', async () => {
    const llm: LlmService = {
      status: () => ({ mode: 'auto', provider: null, model: null, available: false }),
      resolve: async () => {
        throw new Error('Ollama se cayó a mitad del análisis');
      },
      warmUp: async () => {},
    };
    const t = await createTestApp({ llm });

    const { id } = await t.runAnalysis();
    const run = (await t.api('GET', `/api/ai/analysis/${id}`)).json() as AnalysisRun;
    expect(run).toMatchObject({ status: 'FAILED', error: 'Ollama se cayó a mitad del análisis' });
    expect(run.stages.find((s) => s.stage === 'EXPLANATION')).toMatchObject({ status: 'FAILED' });
    expect(run.stages.find((s) => s.stage === 'RECOMMENDATION')).toMatchObject({
      status: 'PENDING',
    });
    // No se guardó nada a medias y se puede volver a intentar.
    expect((await t.api('GET', '/api/anomalies')).json()).toEqual([]);
    expect((await t.api('POST', '/api/ai/analyze')).statusCode).toBe(202);
    await t.close();
  });
});

describe('análisis con un LLM disponible', () => {
  it('guarda el texto del modelo y lo informa en la etapa y en la investigación', async () => {
    const provider: NarrativeProvider = {
      name: 'ollama',
      model: 'fake-model',
      generate: async ({ baseExplanation, baseSteps }) => ({
        explanation: `Resumen para mantenimiento. ${baseExplanation}`,
        steps: baseSteps,
      }),
    };
    const llm: LlmService = {
      status: () => ({ mode: 'auto', provider: 'ollama', model: 'fake-model', available: true }),
      resolve: async () => provider,
      warmUp: async () => {},
    };
    const t = await createTestApp({ llm });

    const { id } = await t.runAnalysis();
    const run = (await t.api('GET', `/api/ai/analysis/${id}`)).json() as AnalysisRun;
    expect(run.summary).toMatchObject({
      llm: { provider: 'ollama', model: 'fake-model' },
      insightsFromLlm: 4,
    });
    expect(run.stages.find((s) => s.stage === 'EXPLANATION')!.summary).toBe(
      '4 de 4 explicaciones redactadas por fake-model.',
    );

    const [first] = (await t.api('GET', '/api/anomalies')).json() as AnomalyListItem[];
    const detail = (await t.api('GET', `/api/anomalies/${first!.id}`)).json() as AnomalyDetail;
    expect(detail.explanation.startsWith('Resumen para mantenimiento.')).toBe(true);
    expect(detail.insight).toEqual({
      source: 'LLM',
      model: 'ollama:fake-model',
      fallbackReason: null,
    });
    await t.close();
  });
});

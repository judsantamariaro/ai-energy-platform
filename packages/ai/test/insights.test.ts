import { describe, expect, it } from 'vitest';
import { generateInsight, generateInsights } from '../src/insights.js';
import type { Narrative, NarrativeProvider } from '../src/types.js';
import { findingOf, findings } from './fixtures.js';

const provider = (generate: () => Promise<Narrative>): NarrativeProvider => ({
  name: 'fake',
  model: 'test-1',
  generate,
});

const m109 = findingOf('M-109');

describe('generateInsight', () => {
  it('sin proveedor usa la plantilla y no registra ningún fallo', async () => {
    const insight = await generateInsight(m109);
    expect(insight).toMatchObject({
      source: 'TEMPLATE',
      model: null,
      fallbackReason: null,
      recommendedAction: 'Investigar medidor e instalación',
    });
  });

  it('usa el texto del LLM cuando está sustentado en la evidencia', async () => {
    const insight = await generateInsight(m109, {
      provider: provider(async () => ({
        explanation:
          'El consumo de M-109 subió 107,9 % desde el 12/09 a las 14:00 y el factor de potencia cayó a 0,74, sin un evento que lo explique.',
        steps: [
          'Inspeccionar las cargas conectadas desde el 12/09.',
          'Revisar la compensación reactiva.',
        ],
      })),
    });
    expect(insight).toMatchObject({ source: 'LLM', model: 'fake:test-1', fallbackReason: null });
    expect(insight.steps).toHaveLength(2);
  });

  it('la frase corta y la acción siempre salen de las reglas, aunque responda el LLM', async () => {
    const withLlm = await generateInsight(m109, {
      provider: provider(async () => ({
        explanation:
          'El consumo subió 107,9 % sin evento que lo explique, con el factor de potencia en 0,74.',
        steps: ['Revisar la instalación.'],
      })),
    });
    const withoutLlm = await generateInsight(m109);
    expect(withLlm.reason).toBe(withoutLlm.reason);
    expect(withLlm.recommendedAction).toBe(withoutLlm.recommendedAction);
  });

  it('descarta el texto del LLM si cita números que no están en la evidencia', async () => {
    const insight = await generateInsight(m109, {
      provider: provider(async () => ({
        explanation:
          'El consumo subió 250 % por una falla en el transformador de 450 kVA reportada ayer.',
        steps: ['Cambiar el transformador.'],
      })),
    });
    expect(insight.source).toBe('TEMPLATE');
    expect(insight.fallbackReason).toContain('250, 450');
  });

  it('usa la plantilla si el LLM falla', async () => {
    const insight = await generateInsight(m109, {
      provider: provider(async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
      }),
    });
    expect(insight.source).toBe('TEMPLATE');
    expect(insight.fallbackReason).toContain('ECONNREFUSED');
  });
});

describe('generateInsights', () => {
  it('genera un texto por hallazgo, en el mismo orden', async () => {
    const insights = await generateInsights(findings);
    expect(insights.map((i) => i.recommendedAction)).toEqual([
      'Investigar medidor e instalación',
      'Validar medidor y datos',
      'Validar operación',
      'No escalar',
    ]);
  });
});

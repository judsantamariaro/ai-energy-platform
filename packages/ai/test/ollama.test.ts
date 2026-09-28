import { describe, expect, it } from 'vitest';
import { createOllamaProvider } from '../src/ollama.js';
import { findingOf } from './fixtures.js';

const request = {
  finding: findingOf('M-109'),
  meter: { name: 'Planta Metalmecánica', location: 'Bucaramanga · Girón' },
  reason: 'Consumo +107,9 % por encima del baseline sin evento que lo explique.',
  recommendedAction: 'Investigar medidor e instalación',
  baseExplanation: 'Desde el 12/09 14:00 UTC el consumo estuvo +107,9 % por encima de lo esperado.',
  baseSteps: ['Inspeccionar en sitio las cargas conectadas.'],
};

function fakeFetch(response: Response) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) });
    return response;
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const chatResponse = (content: unknown) =>
  new Response(
    JSON.stringify({ message: { role: 'assistant', content: JSON.stringify(content) } }),
  );

describe('createOllamaProvider', () => {
  it('pide salida estructurada y envía los hechos ya redactados, sin la evidencia cruda', async () => {
    const { calls, fetchFn } = fakeFetch(
      chatResponse({ explanation: 'x'.repeat(50), steps: ['Revisar la instalación.'] }),
    );
    const provider = createOllamaProvider({ model: 'qwen2.5:3b', fetch: fetchFn });

    await provider.generate(request);

    const [call] = calls;
    expect(call!.url).toBe('http://127.0.0.1:11434/api/chat');
    expect(call!.body).toMatchObject({ model: 'qwen2.5:3b', stream: false });
    expect(call!.body.format).toMatchObject({ type: 'object', required: ['explanation', 'steps'] });

    const prompt = (call!.body.messages as { role: string; content: string }[])[1]!.content;
    expect(prompt).toContain('MEDIDOR: M-109 · Planta Metalmecánica · Bucaramanga · Girón');
    expect(prompt).toContain('confianza de la clasificación 0,97');
    expect(prompt).toContain(`EXPLICACIÓN BASE (hechos verificados):
${request.baseExplanation}`);
    // Sin JSON de evidencia: nada de ids, nombres de campos ni fechas ISO.
    expect(prompt).not.toMatch(/eventId|meanDeviation|\d{4}-\d{2}-\d{2}T/);
  });

  it('falla si Ollama responde con error', async () => {
    const { fetchFn } = fakeFetch(new Response('model not found', { status: 404 }));
    const provider = createOllamaProvider({ model: 'no-existe', fetch: fetchFn });
    await expect(provider.generate(request)).rejects.toThrow('Ollama respondió 404');
  });

  it('falla si la respuesta no cumple el esquema', async () => {
    const { fetchFn } = fakeFetch(chatResponse({ explanation: 'corta', steps: [] }));
    const provider = createOllamaProvider({ model: 'qwen2.5:3b', fetch: fetchFn });
    await expect(provider.generate(request)).rejects.toThrow();
  });
});

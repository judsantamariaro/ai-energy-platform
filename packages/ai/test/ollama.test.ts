import { describe, expect, it } from 'vitest';
import { createOllamaProvider } from '../src/ollama.js';
import { findingOf } from './fixtures.js';

const request = {
  finding: findingOf('M-109'),
  meter: { name: 'Planta Metalmecánica', location: 'Bucaramanga · Girón' },
  reason: 'Consumo +107,9 % por encima del baseline sin evento que lo explique.',
  recommendedAction: 'Investigar medidor e instalación',
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
  it('pide salida estructurada al modelo y envía solo la evidencia necesaria', async () => {
    const { calls, fetchFn } = fakeFetch(
      chatResponse({ explanation: 'x'.repeat(50), steps: ['Revisar la instalación.'] }),
    );
    const provider = createOllamaProvider({ model: 'qwen2.5:3b', fetch: fetchFn });

    await provider.generate(request);

    const [call] = calls;
    expect(call!.url).toBe('http://127.0.0.1:11434/api/chat');
    expect(call!.body).toMatchObject({ model: 'qwen2.5:3b', stream: false });
    expect(call!.body.format).toMatchObject({ type: 'object', required: ['explanation', 'steps'] });

    const userMessage = (call!.body.messages as { role: string; content: string }[])[1]!;
    const payload = JSON.parse(userMessage.content);
    expect(payload.medidor.nombre).toBe('Planta Metalmecánica');
    expect(payload.evidencia.signals).toContain('POWER_FACTOR_DEGRADATION');
    expect(payload.evidencia).not.toHaveProperty('confidenceFactors');
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

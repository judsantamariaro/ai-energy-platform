import { createOllamaProvider, type NarrativeProvider } from '@aiem/ai';
import type { Config, LlmMode } from '../config.js';

export interface LlmStatus {
  mode: LlmMode;
  provider: string | null;
  model: string | null;
  available: boolean;
}

/** Decide qué redacta las explicaciones: Ollama (si corresponde y responde) o las plantillas. */
export interface LlmService {
  status(): LlmStatus;
  /** Revisa la disponibilidad y devuelve el proveedor a usar, o null para usar plantillas. */
  resolve(): Promise<NarrativeProvider | null>;
  /** Carga el modelo en memoria para que el primer análisis no espere. No falla si no hay LLM. */
  warmUp(): Promise<void>;
}

export const NO_LLM: LlmService = {
  status: () => ({ mode: 'none', provider: null, model: null, available: false }),
  resolve: async () => null,
  warmUp: async () => {},
};

export function createLlmService(
  llm: Config['llm'],
  log: { info: (msg: string) => void; warn: (msg: string) => void },
  doFetch: typeof fetch = fetch,
): LlmService {
  if (llm.mode === 'none') return NO_LLM;

  const baseUrl = llm.ollamaUrl.replace(/\/$/, '');
  const provider = createOllamaProvider({
    baseUrl,
    model: llm.model,
    timeoutMs: llm.timeoutMs,
    fetch: doFetch,
  });
  let available = false;

  /** Ollama responde y tiene el modelo descargado. */
  async function check(): Promise<boolean> {
    try {
      const res = await doFetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) return false;
      const body = (await res.json()) as { models?: { name: string }[] };
      const names = (body.models ?? []).map((m) => m.name);
      const found = names.some((n) => n === llm.model || n === `${llm.model}:latest`);
      if (!found)
        log.warn(
          `Ollama responde, pero no tiene el modelo ${llm.model} (ollama pull ${llm.model})`,
        );
      return found;
    } catch {
      return false;
    }
  }

  return {
    status: () => ({
      mode: llm.mode,
      provider: available ? 'ollama' : null,
      model: available ? llm.model : null,
      available,
    }),
    async resolve() {
      const wasAvailable = available;
      available = await check();
      if (available !== wasAvailable) {
        log.info(
          available
            ? `LLM local disponible: ollama:${llm.model}`
            : 'LLM local no disponible: las explicaciones usan plantillas',
        );
      }
      if (!available && llm.mode === 'ollama') {
        log.warn(
          `LLM_PROVIDER=ollama, pero ${baseUrl} no responde con ${llm.model}: se usan plantillas`,
        );
      }
      return available ? provider : null;
    },
    async warmUp() {
      if (!(await this.resolve())) return;
      try {
        // Una petición sin prompt hace que Ollama cargue el modelo y lo mantenga en memoria.
        await doFetch(`${baseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: llm.model, keep_alive: '30m' }),
          signal: AbortSignal.timeout(180_000),
        });
        log.info(`Modelo ${llm.model} precargado`);
      } catch (err) {
        log.warn(`No se pudo precargar ${llm.model}: ${(err as Error).message}`);
      }
    },
  };
}

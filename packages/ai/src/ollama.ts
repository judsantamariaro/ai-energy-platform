import { z } from 'zod';
import type { Narrative, NarrativeProvider, NarrativeRequest } from './types.js';

/** Respuesta que se le pide al modelo; se valida antes de usarla. */
export const NarrativeSchema = z.object({
  explanation: z.string().min(40).max(1200),
  steps: z.array(z.string().min(5).max(300)).min(1).max(5),
});

const SYSTEM_PROMPT = `Eres un analista de gestión energética. Redactas, en español neutro y claro, la
explicación de un hallazgo detectado por un motor estadístico en un medidor eléctrico.

Reglas estrictas:
- Usa SOLO los datos del JSON que recibes. No inventes cifras, fechas, causas ni eventos.
- Todo número que escribas debe estar en el JSON (puedes redondearlo o expresarlo en %).
- No cambies la clasificación, la severidad ni la acción recomendada: explícalas.
- "explanation": 3 a 5 frases. Qué se observó, qué variables cambiaron, qué eventos se revisaron
  y por qué eso lleva a la clasificación.
- "steps": 2 a 4 pasos concretos para ejecutar la acción recomendada.
- Las fechas están en UTC.
Responde únicamente con JSON: {"explanation": string, "steps": string[]}.`;

const TYPE_LABELS = {
  REAL_ANOMALY: 'anomalía real',
  EXPLAINABLE_ANOMALY: 'anomalía explicable',
  FALSE_POSITIVE: 'falso positivo',
  DATA_QUALITY: 'problema de calidad de datos',
} as const;

/** Lo que ve el modelo: la evidencia del motor, sin el detalle interno de puntajes. */
export function promptPayload(request: NarrativeRequest) {
  const { finding, meter } = request;
  const { confidenceFactors: _factors, priority: _priority, ...evidence } = finding.evidence;
  return {
    medidor: { id: finding.meterId, nombre: meter.name ?? null, ubicacion: meter.location ?? null },
    clasificacion: TYPE_LABELS[finding.type],
    severidad: finding.severity,
    confianza: finding.confidence,
    resumen: request.reason,
    accion_recomendada: request.recommendedAction,
    evidencia: evidence,
  };
}

export function buildPrompt(request: NarrativeRequest): string {
  return JSON.stringify(promptPayload(request), null, 2);
}

export interface OllamaOptions {
  baseUrl?: string;
  model: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** Modelo local servido por Ollama (https://ollama.com). No requiere API key. */
export function createOllamaProvider(options: OllamaOptions): NarrativeProvider {
  const baseUrl = (options.baseUrl ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 60_000;

  return {
    name: 'ollama',
    model: options.model,
    async generate(request): Promise<Narrative> {
      const res = await doFetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model: options.model,
          stream: false,
          // Salida estructurada: Ollama restringe la respuesta a este esquema JSON.
          format: z.toJSONSchema(NarrativeSchema),
          options: { temperature: 0.2 },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildPrompt(request) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Ollama respondió ${res.status}: ${await res.text()}`);

      const body = (await res.json()) as { message?: { content?: string } };
      const content = body.message?.content;
      if (!content) throw new Error('Ollama no devolvió contenido');
      return NarrativeSchema.parse(JSON.parse(content));
    },
  };
}

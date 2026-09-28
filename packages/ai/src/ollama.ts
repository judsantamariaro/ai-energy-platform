import { z } from 'zod';
import type { Narrative, NarrativeProvider, NarrativeRequest } from './types.js';

/** Respuesta que se le pide al modelo; se valida antes de usarla. */
export const NarrativeSchema = z.object({
  explanation: z.string().min(40).max(1200),
  steps: z.array(z.string().min(5).max(300)).min(1).max(5),
});

const SYSTEM_PROMPT = `Eres un analista de gestión energética que redacta para el jefe de mantenimiento
de una planta. Recibes un hallazgo ya analizado por un motor estadístico: su clasificación, una
explicación base con los hechos verificados y unos pasos base. Tu trabajo es reescribirlos para que
se entiendan mejor y aporten criterio técnico.

Reglas:
1. Los hechos de la explicación base son la única fuente de verdad. No agregues cifras, fechas,
   eventos ni causas que no estén ahí.
2. Copia los números tal como aparecen en la explicación base (formato español: 107,9 %, 0,740).
3. Si la clasificación es "anomalía real" o "problema de calidad de datos", la causa NO se conoce:
   di que las variables cambiaron "al mismo tiempo" y plantea hipótesis con "podría indicar" o "es
   compatible con". Nunca escribas "se debe a", "debido a", "causado por" ni "ha sido identificado".
4. No menciones identificadores internos, nombres de campos ni fechas en formato técnico. Escribe las
   fechas como aparecen en la explicación base.
5. La confianza es la del motor en su clasificación, no la calidad de los datos.
6. No cambies la clasificación, la severidad ni la acción recomendada.
7. "explanation": de 3 a 5 frases: qué pasó, qué variables cambiaron, qué se revisó de los eventos y
   por qué eso lleva a la clasificación.
8. "steps": de 2 a 4 pasos concretos y coherentes con la acción recomendada. Si la acción es "No
   escalar", no propongas escalar, comunicar ni avisar a nadie.
Responde solo con JSON: {"explanation": string, "steps": string[]}.`;

const TYPE_LABELS = {
  REAL_ANOMALY: 'anomalía real',
  EXPLAINABLE_ANOMALY: 'anomalía explicable',
  FALSE_POSITIVE: 'falso positivo',
  DATA_QUALITY: 'problema de calidad de datos',
} as const;

/**
 * Lo que ve el modelo. No recibe la evidencia en JSON: un modelo chico se confunde con los nombres
 * de campos y los ids. Recibe los hechos ya redactados por la plantilla, que salen de la evidencia.
 */
export function promptPayload(request: NarrativeRequest) {
  const { finding, meter } = request;
  return {
    medidor: [finding.meterId, meter.name, meter.location].filter(Boolean).join(' · '),
    clasificacion: TYPE_LABELS[finding.type],
    severidad: finding.severity,
    confianza: finding.confidence,
    accion_recomendada: request.recommendedAction,
    // Las fechas de la explicación base no llevan año: sin él, el modelo tiende a inventarlo.
    anio: new Date(finding.windowStart).getUTCFullYear(),
    resumen: request.reason,
    explicacion_base: request.baseExplanation,
    pasos_base: request.baseSteps,
  };
}

export function buildPrompt(request: NarrativeRequest): string {
  const p = promptPayload(request);
  return [
    `MEDIDOR: ${p.medidor}`,
    `CLASIFICACIÓN: ${p.clasificacion} · severidad ${p.severidad} · ` +
      `confianza de la clasificación ${String(p.confianza).replace('.', ',')}`,
    `ACCIÓN RECOMENDADA: ${p.accion_recomendada}`,
    `FECHAS: todas son del año ${p.anio}, en hora UTC.`,
    `RESUMEN: ${p.resumen}`,
    '',
    'EXPLICACIÓN BASE (hechos verificados):',
    p.explicacion_base,
    '',
    'PASOS BASE:',
    ...p.pasos_base.map((s) => `- ${s}`),
  ].join('\n');
}

export interface OllamaOptions {
  baseUrl?: string;
  model: string;
  timeoutMs?: number;
  /** Cuánto tiempo mantiene Ollama el modelo cargado tras cada petición (evita recargarlo). */
  keepAlive?: string;
  fetch?: typeof fetch;
}

/** Modelo local servido por Ollama (https://ollama.com). No requiere API key. */
export function createOllamaProvider(options: OllamaOptions): NarrativeProvider {
  const baseUrl = (options.baseUrl ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const keepAlive = options.keepAlive ?? '30m';

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
          keep_alive: keepAlive,
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

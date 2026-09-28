import type { Finding } from '@aiem/engine';
import { allowedNumbers, ungroundedNumbers } from './grounding.js';
import { contentViolations } from './guardrails.js';
import { promptPayload } from './ollama.js';
import { RECOMMENDED_ACTIONS, templateNarrative, templateReason } from './templates.js';
import type { Insight, MeterContext, NarrativeProvider } from './types.js';

export interface GenerateOptions {
  /** Sin proveedor, todos los textos salen de las plantillas. */
  provider?: NarrativeProvider | null;
  meters?: Record<string, MeterContext>;
}

/**
 * Genera el texto de cada hallazgo. La frase corta y la acción siempre salen de las reglas; la
 * explicación y los pasos los redacta el LLM si hay uno y su respuesta está sustentada en la
 * evidencia. Ante cualquier fallo se usa la plantilla y se deja registrado el motivo.
 */
export async function generateInsight(
  finding: Finding,
  options: GenerateOptions = {},
): Promise<Insight> {
  const reason = templateReason(finding);
  const recommendedAction = RECOMMENDED_ACTIONS[finding.type];
  const template = templateNarrative(finding);
  const fromTemplate = (fallbackReason: string | null): Insight => ({
    reason,
    recommendedAction,
    ...template,
    source: 'TEMPLATE',
    model: null,
    fallbackReason,
  });

  const { provider } = options;
  if (!provider) return fromTemplate(null);

  try {
    const request = {
      finding,
      meter: options.meters?.[finding.meterId] ?? {},
      reason,
      recommendedAction,
      baseExplanation: template.explanation,
      baseSteps: template.steps,
    };
    const narrative = await provider.generate(request);

    // Solo vale lo que el modelo vio.
    const allowed = allowedNumbers(promptPayload(request));
    const invented = ungroundedNumbers(
      [narrative.explanation, ...narrative.steps].join(' '),
      allowed,
    );
    if (invented.length > 0) {
      return fromTemplate(
        `El modelo citó números que no están en la evidencia: ${invented.join(', ')}`,
      );
    }
    const violations = contentViolations(narrative, finding.type);
    if (violations.length > 0) {
      return fromTemplate(`El texto del modelo ${violations.join('; ')}`);
    }

    return {
      reason,
      recommendedAction,
      explanation: narrative.explanation.trim(),
      steps: narrative.steps.map((s) => s.trim()),
      source: 'LLM',
      model: `${provider.name}:${provider.model}`,
      fallbackReason: null,
    };
  } catch (err) {
    return fromTemplate(`El modelo no respondió correctamente: ${(err as Error).message}`);
  }
}

/** Genera los textos en serie: un modelo local atiende una petición a la vez. */
export async function generateInsights(
  findings: Finding[],
  options: GenerateOptions = {},
): Promise<Insight[]> {
  const insights: Insight[] = [];
  for (const finding of findings) insights.push(await generateInsight(finding, options));
  return insights;
}

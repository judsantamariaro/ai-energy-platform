/**
 * Capa de IA: convierte la evidencia del motor en una explicación y una recomendación.
 * Las plantillas siempre están disponibles; un LLM local (Ollama) es opcional.
 */
export { generateInsight, generateInsights, type GenerateOptions } from './insights.js';
export { createOllamaProvider, type OllamaOptions } from './ollama.js';
export { RECOMMENDED_ACTIONS, templateNarrative, templateReason } from './templates.js';
export type * from './types.js';

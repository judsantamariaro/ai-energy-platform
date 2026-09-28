import type { Finding } from '@aiem/engine';

export type InsightSource = 'TEMPLATE' | 'LLM';

/** Texto de un hallazgo, listo para mostrar. */
export interface Insight {
  /** Frase corta para listados. Siempre sale de las reglas. */
  reason: string;
  /** Acción principal. Siempre sale de las reglas según el tipo (F3-f). */
  recommendedAction: string;
  /** "Qué encontró la IA": plantilla o LLM. */
  explanation: string;
  /** Pasos concretos para ejecutar la acción: plantilla o LLM. */
  steps: string[];
  source: InsightSource;
  /** Modelo que generó el texto, si fue un LLM. */
  model: string | null;
  /** Por qué se usó la plantilla cuando había un LLM configurado. */
  fallbackReason: string | null;
}

/** Contexto del medidor que no está en la evidencia del motor. */
export interface MeterContext {
  name?: string | null;
  location?: string | null;
}

export interface NarrativeRequest {
  finding: Finding;
  meter: MeterContext;
  reason: string;
  recommendedAction: string;
  /** Texto de la plantilla: el LLM lo reescribe y enriquece, no parte de cero. */
  baseExplanation: string;
  baseSteps: string[];
}

export interface Narrative {
  explanation: string;
  steps: string[];
}

/** Un generador de texto (LLM). Debe lanzar un error si no puede responder. */
export interface NarrativeProvider {
  name: string;
  model: string;
  generate(request: NarrativeRequest): Promise<Narrative>;
}

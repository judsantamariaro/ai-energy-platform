/** Enums del dominio, tal como los nombra el enunciado. */
import { z } from 'zod';

export const AnomalyType = z.enum([
  'REAL_ANOMALY',
  'EXPLAINABLE_ANOMALY',
  'FALSE_POSITIVE',
  'DATA_QUALITY',
]);
export type AnomalyType = z.infer<typeof AnomalyType>;

export const Severity = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type Severity = z.infer<typeof Severity>;

export const MeterStatus = z.enum(['OK', 'ALERT', 'CRITICAL']);
export type MeterStatus = z.infer<typeof MeterStatus>;

/** Etapas del análisis, en el orden del enunciado (sección 13). */
export const AnalysisStage = z.enum([
  'READINGS',
  'BASELINE',
  'DETECTION',
  'CORRELATION',
  'EVENTS',
  'EXPLANATION',
  'RECOMMENDATION',
]);
export type AnalysisStage = z.infer<typeof AnalysisStage>;

export const AnalysisRunStatus = z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']);
export type AnalysisRunStatus = z.infer<typeof AnalysisRunStatus>;

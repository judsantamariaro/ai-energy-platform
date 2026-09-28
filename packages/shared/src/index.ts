/**
 * Contratos compartidos entre API y frontend (tipos + esquemas zod).
 * Los enums salen literalmente del enunciado; el resto del dominio se define en la F1.
 */
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

export const HealthResponse = z.object({
  status: z.literal('ok'),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/**
 * Constantes sin zod: el frontend puede importarlas sin cargar la librería de validación
 * (`@aiem/shared/constants`).
 */
import type { AnomalyStatus } from './api.js';

/** Estados en los que una anomalía todavía requiere atención. */
export const ACTIVE_ANOMALY_STATUSES: readonly AnomalyStatus[] = ['OPEN', 'IN_PROGRESS'];

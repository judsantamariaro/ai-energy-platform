/**
 * Contratos de la API: la API valida con estos esquemas y el frontend los usa como tipos.
 * Fechas en ISO 8601 UTC; magnitudes relativas como fracciones (0.25 = 25 %).
 */
import { z } from 'zod';
import { AnalysisRunStatus, AnalysisStage, AnomalyType, MeterStatus, Severity } from './domain.js';

export const AnomalyStatus = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED']);
export type AnomalyStatus = z.infer<typeof AnomalyStatus>;

/** Estados en los que una anomalía todavía requiere atención. */
export const ACTIVE_ANOMALY_STATUSES: readonly AnomalyStatus[] = ['OPEN', 'IN_PROGRESS'];

export const ErrorResponse = z.object({ error: z.string(), message: z.string() });

// ─── Auth ──────────────────────────────────────────────────────────────────────

export const LoginRequest = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const User = z.object({ id: z.number(), email: z.string(), name: z.string() });
export type User = z.infer<typeof User>;

// ─── Medidores ─────────────────────────────────────────────────────────────────

export const CurrentConsumption = z.object({
  windowHours: z.number(),
  consumptionKwh: z.number(),
  baselineKwh: z.number(),
  variation: z.number(),
});

export const AnomalyRef = z.object({
  id: z.string(),
  type: AnomalyType,
  severity: Severity,
  status: AnomalyStatus,
});

export const MeterListItem = z.object({
  meterId: z.string(),
  name: z.string(),
  location: z.string().nullable(),
  status: MeterStatus,
  readings: z.number(),
  periodConsumptionKwh: z.number(),
  /** Últimas 24 h frente al baseline; null hasta que corre el primer análisis. */
  current: CurrentConsumption.nullable(),
  /** La anomalía activa de mayor prioridad, si hay. */
  topAnomaly: AnomalyRef.nullable(),
});
export type MeterListItem = z.infer<typeof MeterListItem>;

export const MeterSort = z.enum(['meterId', 'consumption', 'variation', 'severity']);
export type MeterSort = z.infer<typeof MeterSort>;

export const MeterListQuery = z.object({
  status: MeterStatus.optional(),
  search: z.string().trim().optional(),
  sort: MeterSort.default('meterId'),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type MeterListQuery = z.infer<typeof MeterListQuery>;

const HourlyProfile = z.array(z.number().nullable()).length(24);

export const MeterDetail = MeterListItem.extend({
  baselineDayKwh: z.number().nullable(),
  /** Perfil esperado por hora del día (UTC); null hasta el primer análisis. */
  baselineProfile: z
    .object({ kwh: HourlyProfile, voltage: HourlyProfile, powerFactor: HourlyProfile })
    .nullable(),
  anomalies: z.array(AnomalyRef),
  events: z.array(
    z.object({ id: z.number(), timestamp: z.string(), type: z.string(), description: z.string() }),
  ),
});
export type MeterDetail = z.infer<typeof MeterDetail>;

export const Reading = z.object({
  timestamp: z.string(),
  consumptionKwh: z.number().nullable(),
  voltageV: z.number().nullable(),
  currentA: z.number().nullable(),
  powerFactor: z.number().nullable(),
});
export type Reading = z.infer<typeof Reading>;

export const ReadingsQuery = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

// ─── Anomalías ─────────────────────────────────────────────────────────────────

export const InsightSource = z.enum(['TEMPLATE', 'LLM']);

export const AnomalyListItem = z.object({
  id: z.string(),
  meterId: z.string(),
  meterName: z.string(),
  type: AnomalyType,
  severity: Severity,
  confidence: z.number(),
  priorityScore: z.number(),
  status: AnomalyStatus,
  reason: z.string(),
  recommendedAction: z.string(),
  windowStart: z.string(),
  windowEnd: z.string().nullable(),
  /** Primera vez que un análisis detectó esta anomalía. */
  detectedAt: z.string(),
});
export type AnomalyListItem = z.infer<typeof AnomalyListItem>;

export const AnomalyListQuery = z.object({
  type: AnomalyType.optional(),
  severity: Severity.optional(),
  status: AnomalyStatus.optional(),
  meterId: z.string().optional(),
});

export const AnomalyAction = z.object({
  id: z.number(),
  status: AnomalyStatus,
  note: z.string().nullable(),
  createdAt: z.string(),
  /** null = acción del sistema (p. ej. un falso positivo descartado al detectarse). */
  user: z.string().nullable(),
});
export type AnomalyAction = z.infer<typeof AnomalyAction>;

export const AnomalyDetail = AnomalyListItem.extend({
  meterLocation: z.string().nullable(),
  explanation: z.string(),
  steps: z.array(z.string()),
  insight: z.object({
    source: InsightSource,
    model: z.string().nullable(),
    fallbackReason: z.string().nullable(),
  }),
  /** Evidencia del motor; su forma es el tipo `Evidence` de @aiem/engine. */
  evidence: z.record(z.string(), z.unknown()),
  actions: z.array(AnomalyAction),
  analysisRunId: z.string(),
});
export type AnomalyDetail = z.infer<typeof AnomalyDetail>;

export const UpdateAnomalyRequest = z.object({
  status: AnomalyStatus,
  note: z.string().trim().max(1000).optional(),
});
export type UpdateAnomalyRequest = z.infer<typeof UpdateAnomalyRequest>;

// ─── Análisis ──────────────────────────────────────────────────────────────────

export const StageStatus = z.enum(['PENDING', 'RUNNING', 'DONE', 'FAILED']);

export const AnalysisStageState = z.object({
  stage: AnalysisStage,
  status: StageStatus,
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  summary: z.string().nullable(),
});
export type AnalysisStageState = z.infer<typeof AnalysisStageState>;

export const AnalysisSummary = z.object({
  anomaliesDetected: z.number(),
  highPriority: z.number(),
  averageConfidence: z.number().nullable(),
  /** Modelo que redactó las explicaciones, si hubo uno disponible. */
  llm: z.object({ provider: z.string(), model: z.string() }).nullable(),
  insightsFromLlm: z.number(),
  message: z.string(),
});
export type AnalysisSummary = z.infer<typeof AnalysisSummary>;

export const AnalysisRun = z.object({
  id: z.string(),
  status: AnalysisRunStatus,
  stages: z.array(AnalysisStageState),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  summary: AnalysisSummary.nullable(),
  error: z.string().nullable(),
});
export type AnalysisRun = z.infer<typeof AnalysisRun>;

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export const DashboardSummary = z.object({
  meters: z.object({
    total: z.number(),
    byStatus: z.object({ OK: z.number(), ALERT: z.number(), CRITICAL: z.number() }),
  }),
  consumption: z.object({
    totalKwh: z.number(),
    periodStart: z.string().nullable(),
    periodEnd: z.string().nullable(),
    daily: z.array(z.object({ date: z.string(), kwh: z.number() })),
  }),
  anomalies: z.object({
    detected: z.number(),
    /** Severidad HIGH y todavía activas (abiertas o en investigación). */
    highPriority: z.number(),
    averageConfidence: z.number().nullable(),
    top: z.array(AnomalyListItem),
  }),
  lastAnalysis: AnalysisRun.pick({ id: true, status: true, finishedAt: true, createdAt: true })
    .extend({ summary: AnalysisSummary.nullable() })
    .nullable(),
});
export type DashboardSummary = z.infer<typeof DashboardSummary>;

export const HealthResponse = z.object({
  status: z.literal('ok'),
  version: z.string(),
  llm: z.object({
    mode: z.enum(['auto', 'ollama', 'none']),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    available: z.boolean(),
  }),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

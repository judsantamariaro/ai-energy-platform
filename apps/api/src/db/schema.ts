import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { Evidence, MeterSummary } from '@aiem/engine';
import {
  AnalysisRunStatus,
  AnomalyStatus,
  AnomalyType,
  MeterStatus,
  Severity,
  type AnalysisStageState,
  type AnalysisSummary,
} from '@aiem/shared';

/** zod 4 tipa `.options` como array; Drizzle necesita una tupla no vacía para `enum`. */
const enumValues = <T extends string>(values: readonly T[]) => values as [T, ...T[]];

/**
 * Todas las fechas se guardan como texto ISO 8601 en UTC (`2026-09-01T00:00:00.000Z`):
 * ordenan bien como texto y el navegador no les aplica la zona horaria local.
 */

export const meters = sqliteTable('meters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  meterId: text('meter_id').notNull().unique(),
  name: text('name').notNull(),
  location: text('location'),
  /** Estado derivado del último análisis (OK / ALERT / CRITICAL). */
  status: text('status', { enum: enumValues(MeterStatus.options) })
    .notNull()
    .default('OK'),
  createdAt: text('created_at').notNull(),
});

export const readings = sqliteTable(
  'readings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    meterId: text('meter_id')
      .notNull()
      .references(() => meters.meterId),
    timestamp: text('timestamp').notNull(),
    // Nullable: un valor vacío en el CSV es un dato faltante, no un motivo para descartar la lectura.
    consumptionKwh: real('consumption_kwh'),
    voltageV: real('voltage_v'),
    currentA: real('current_a'),
    powerFactor: real('power_factor'),
    /** Estado tal como viene de la fuente; el motor no lo usa para detectar. */
    status: text('status'),
  },
  (t) => [uniqueIndex('readings_meter_ts_uq').on(t.meterId, t.timestamp)],
);

export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    meterId: text('meter_id')
      .notNull()
      .references(() => meters.meterId),
    timestamp: text('timestamp').notNull(),
    /** Texto libre: el motor solo usa como explicación los tipos que conoce. */
    type: text('type').notNull(),
    description: text('description').notNull().default(''),
  },
  (t) => [uniqueIndex('events_meter_ts_type_uq').on(t.meterId, t.timestamp, t.type)],
);

export const analysisRuns = sqliteTable('analysis_runs', {
  id: text('id').primaryKey(),
  status: text('status', { enum: enumValues(AnalysisRunStatus.options) }).notNull(),
  stages: text('stages', { mode: 'json' }).$type<AnalysisStageState[]>().notNull(),
  createdAt: text('created_at').notNull(),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
  summary: text('summary', { mode: 'json' }).$type<AnalysisSummary>(),
  /** Resumen por medidor que calculó el motor (consumo actual, baseline, perfil horario). */
  meterSummaries: text('meter_summaries', { mode: 'json' }).$type<MeterSummary[]>(),
  error: text('error'),
});

/**
 * Una fila por hallazgo, identificada por la clave determinista del motor (`finding_key`). Si un
 * análisis nuevo vuelve a encontrar el mismo hallazgo, se actualiza la misma fila: el id, el estado
 * y el historial de acciones se conservan. Los hallazgos vigentes son los del último análisis.
 */
export const anomalies = sqliteTable(
  'anomalies',
  {
    id: text('id').primaryKey(),
    findingKey: text('finding_key').notNull(),
    /** Último análisis que detectó la anomalía. */
    analysisRunId: text('analysis_run_id')
      .notNull()
      .references(() => analysisRuns.id),
    meterId: text('meter_id')
      .notNull()
      .references(() => meters.meterId),
    /** Primera vez que un análisis la detectó. */
    detectedAt: text('detected_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    /** Ventana del incidente en la serie de datos. */
    windowStart: text('window_start').notNull(),
    windowEnd: text('window_end'),
    type: text('type', { enum: enumValues(AnomalyType.options) }).notNull(),
    severity: text('severity', { enum: enumValues(Severity.options) }).notNull(),
    confidence: real('confidence').notNull(),
    priorityScore: real('priority_score').notNull(),
    reason: text('reason').notNull(),
    recommendedAction: text('recommended_action').notNull(),
    explanation: text('explanation').notNull(),
    steps: text('steps', { mode: 'json' }).$type<string[]>().notNull(),
    insightSource: text('insight_source', { enum: ['TEMPLATE', 'LLM'] }).notNull(),
    insightModel: text('insight_model'),
    insightFallbackReason: text('insight_fallback_reason'),
    status: text('status', { enum: enumValues(AnomalyStatus.options) })
      .notNull()
      .default('OPEN'),
    relatedEventId: integer('related_event_id').references(() => events.id),
    /** Evidencia estructurada del motor (tipo `Evidence` de @aiem/engine). */
    evidence: text('evidence', { mode: 'json' }).$type<Evidence>().notNull(),
  },
  (t) => [
    uniqueIndex('anomalies_finding_key_uq').on(t.findingKey),
    index('anomalies_meter_idx').on(t.meterId),
    index('anomalies_run_idx').on(t.analysisRunId),
  ],
);

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull(),
});

/** Historial de la "Acción": cada cambio de estado de una anomalía, con nota y autor. */
export const anomalyActions = sqliteTable(
  'anomaly_actions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    anomalyId: text('anomaly_id')
      .notNull()
      .references(() => anomalies.id, { onDelete: 'cascade' }),
    status: text('status', { enum: enumValues(AnomalyStatus.options) }).notNull(),
    note: text('note'),
    /** null = acción del sistema. */
    userId: integer('user_id').references(() => users.id),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('anomaly_actions_anomaly_idx').on(t.anomalyId)],
);

import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { AnalysisRunStatus, AnalysisStage, MeterStatus } from '@aiem/shared';

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

export interface AnalysisStageState {
  stage: AnalysisStage;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  startedAt: string | null;
  finishedAt: string | null;
  /** Resumen legible de lo que hizo la etapa, para mostrar el progreso en la UI. */
  summary: string | null;
}

export const analysisRuns = sqliteTable('analysis_runs', {
  id: text('id').primaryKey(),
  status: text('status', { enum: enumValues(AnalysisRunStatus.options) }).notNull(),
  stages: text('stages', { mode: 'json' }).$type<AnalysisStageState[]>().notNull(),
  createdAt: text('created_at').notNull(),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
  /** Totales del análisis (p. ej. anomalías detectadas y de alta prioridad). Forma definida en la F4. */
  summary: text('summary', { mode: 'json' }).$type<Record<string, unknown>>(),
  error: text('error'),
});

export const anomalies = sqliteTable(
  'anomalies',
  {
    id: text('id').primaryKey(),
    analysisRunId: text('analysis_run_id')
      .notNull()
      .references(() => analysisRuns.id, { onDelete: 'cascade' }),
    meterId: text('meter_id')
      .notNull()
      .references(() => meters.meterId),
    /** Momento en que el análisis generó la anomalía. */
    detectedAt: text('detected_at').notNull(),
    /** Ventana del incidente en la serie de datos. */
    windowStart: text('window_start').notNull(),
    windowEnd: text('window_end'),
    type: text('type').notNull(),
    severity: text('severity').notNull(),
    confidence: real('confidence').notNull(),
    priorityScore: real('priority_score').notNull(),
    reason: text('reason').notNull(),
    recommendedAction: text('recommended_action').notNull(),
    /** Ciclo de vida de la anomalía; los valores posibles se definen en la F4. */
    status: text('status').notNull().default('OPEN'),
    relatedEventId: integer('related_event_id').references(() => events.id),
    /** Evidencia estructurada que sustenta la explicación. Forma definida en la F2. */
    evidence: text('evidence', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  },
  (t) => [
    index('anomalies_meter_idx').on(t.meterId),
    index('anomalies_run_idx').on(t.analysisRunId),
  ],
);

import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import type { Insight } from '@aiem/ai';
import type { Finding } from '@aiem/engine';
import {
  ACTIVE_ANOMALY_STATUSES,
  type AnomalyAction,
  type AnomalyDetail,
  type AnomalyListItem,
  type AnomalyStatus,
  type AnomalyType,
  type Severity,
} from '@aiem/shared';
import type { Db } from '../db/client.js';
import { anomalies, anomalyActions, meters, users } from '../db/schema.js';
import { latestCompletedRun } from './runs.js';

export type AnomalyRow = typeof anomalies.$inferSelect;

const CLOSED_STATUSES: readonly AnomalyStatus[] = ['RESOLVED', 'DISMISSED'];
const SEVERITY_RANK: Record<Severity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
const SEVERITY_LABEL: Record<Severity, string> = { LOW: 'baja', MEDIUM: 'media', HIGH: 'alta' };

export const FALSE_POSITIVE_NOTE =
  'Descartada automáticamente: el cambio lo explica un evento operativo. No escalar.';

function toListItem(row: AnomalyRow, meterName: string): AnomalyListItem {
  return {
    id: row.id,
    meterId: row.meterId,
    meterName,
    type: row.type,
    severity: row.severity,
    confidence: row.confidence,
    priorityScore: row.priorityScore,
    status: row.status,
    reason: row.reason,
    recommendedAction: row.recommendedAction,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    detectedAt: row.detectedAt,
  };
}

/** El evento que mejor contextualiza el hallazgo: el que lo explica o corrobora, o el primero. */
function relatedEventId(finding: Finding): number | null {
  const events = finding.evidence.events;
  const key = events.find((e) => e.role !== 'NOT_EXPLANATORY') ?? events[0];
  return key?.eventId ?? null;
}

/**
 * Guarda los hallazgos de un análisis. Un hallazgo que ya existía (misma clave) actualiza su fila y
 * conserva id, estado e historial; uno nuevo se crea abierto, salvo los falsos positivos, que nacen
 * descartados con una acción del sistema que lo deja registrado.
 */
export function saveFindings(
  db: Db,
  runId: string,
  items: { finding: Finding; insight: Insight }[],
  now: Date,
): void {
  const timestamp = now.toISOString();

  for (const { finding, insight } of items) {
    const values = {
      analysisRunId: runId,
      meterId: finding.meterId,
      updatedAt: timestamp,
      windowStart: finding.windowStart,
      windowEnd: finding.windowEnd,
      type: finding.type,
      severity: finding.severity,
      confidence: finding.confidence,
      priorityScore: finding.priorityScore,
      reason: insight.reason,
      recommendedAction: insight.recommendedAction,
      explanation: insight.explanation,
      steps: insight.steps,
      insightSource: insight.source,
      insightModel: insight.model,
      insightFallbackReason: insight.fallbackReason,
      relatedEventId: relatedEventId(finding),
      evidence: finding.evidence,
    };

    const existing = db
      .select({ id: anomalies.id, status: anomalies.status, severity: anomalies.severity })
      .from(anomalies)
      .where(eq(anomalies.findingKey, finding.key))
      .get();
    if (existing) {
      // Cerrada por el usuario pero ahora más grave: se reabre y queda registrado por qué.
      const reopen =
        CLOSED_STATUSES.includes(existing.status) &&
        SEVERITY_RANK[finding.severity] > SEVERITY_RANK[existing.severity];
      db.update(anomalies)
        .set(reopen ? { ...values, status: 'OPEN' } : values)
        .where(eq(anomalies.id, existing.id))
        .run();
      if (reopen) {
        db.insert(anomalyActions)
          .values({
            anomalyId: existing.id,
            status: 'OPEN',
            note: `Reabierta automáticamente: un nuevo análisis la detectó con severidad ${SEVERITY_LABEL[finding.severity]} (antes ${SEVERITY_LABEL[existing.severity]}).`,
            createdAt: timestamp,
          })
          .run();
      }
      continue;
    }

    const id = randomUUID();
    const isFalsePositive = finding.type === 'FALSE_POSITIVE';
    db.insert(anomalies)
      .values({
        id,
        findingKey: finding.key,
        detectedAt: timestamp,
        status: isFalsePositive ? 'DISMISSED' : 'OPEN',
        ...values,
      })
      .run();
    if (isFalsePositive) {
      db.insert(anomalyActions)
        .values({
          anomalyId: id,
          status: 'DISMISSED',
          note: FALSE_POSITIVE_NOTE,
          createdAt: timestamp,
        })
        .run();
    }
  }
}

export interface AnomalyFilters {
  type?: AnomalyType;
  severity?: Severity;
  status?: AnomalyStatus;
  meterId?: string;
}

/** Anomalías vigentes (las del último análisis completado), de mayor a menor prioridad. */
export function listCurrentAnomalies(db: Db, filters: AnomalyFilters = {}): AnomalyListItem[] {
  const run = latestCompletedRun(db);
  if (!run) return [];

  const conditions: SQL[] = [eq(anomalies.analysisRunId, run.id)];
  if (filters.type) conditions.push(eq(anomalies.type, filters.type));
  if (filters.severity) conditions.push(eq(anomalies.severity, filters.severity));
  if (filters.status) conditions.push(eq(anomalies.status, filters.status));
  if (filters.meterId) conditions.push(eq(anomalies.meterId, filters.meterId));

  return db
    .select({ anomaly: anomalies, meterName: meters.name })
    .from(anomalies)
    .innerJoin(meters, eq(meters.meterId, anomalies.meterId))
    .where(and(...conditions))
    .orderBy(desc(anomalies.priorityScore), asc(anomalies.meterId))
    .all()
    .map((r) => toListItem(r.anomaly, r.meterName));
}

export function listActiveAnomalies(db: Db): AnomalyListItem[] {
  return listCurrentAnomalies(db).filter((a) => ACTIVE_ANOMALY_STATUSES.includes(a.status));
}

function listActions(db: Db, anomalyId: string): AnomalyAction[] {
  return db
    .select({ action: anomalyActions, userName: users.name })
    .from(anomalyActions)
    .leftJoin(users, eq(users.id, anomalyActions.userId))
    .where(eq(anomalyActions.anomalyId, anomalyId))
    .orderBy(asc(anomalyActions.createdAt), asc(anomalyActions.id))
    .all()
    .map(({ action, userName }) => ({
      id: action.id,
      status: action.status,
      note: action.note,
      createdAt: action.createdAt,
      user: userName,
    }));
}

export function getAnomaly(db: Db, id: string): AnomalyDetail | null {
  const row = db
    .select({ anomaly: anomalies, meterName: meters.name, meterLocation: meters.location })
    .from(anomalies)
    .innerJoin(meters, eq(meters.meterId, anomalies.meterId))
    .where(eq(anomalies.id, id))
    .get();
  if (!row) return null;

  const a = row.anomaly;
  return {
    ...toListItem(a, row.meterName),
    meterLocation: row.meterLocation,
    explanation: a.explanation,
    steps: a.steps,
    insight: {
      source: a.insightSource,
      model: a.insightModel,
      fallbackReason: a.insightFallbackReason,
    },
    evidence: a.evidence as unknown as Record<string, unknown>,
    actions: listActions(db, a.id),
    analysisRunId: a.analysisRunId,
  };
}

/** La "Acción": cambia el estado y deja el cambio en el historial. */
export function updateAnomalyStatus(
  db: Db,
  id: string,
  change: { status: AnomalyStatus; note?: string; userId: number },
  now: Date,
): boolean {
  return db.transaction((tx) => {
    const updated = tx
      .update(anomalies)
      .set({ status: change.status, updatedAt: now.toISOString() })
      .where(eq(anomalies.id, id))
      .run();
    if (updated.changes === 0) return false;
    tx.insert(anomalyActions)
      .values({
        anomalyId: id,
        status: change.status,
        note: change.note || null,
        userId: change.userId,
        createdAt: now.toISOString(),
      })
      .run();
    return true;
  });
}

export function currentAnomaliesForMeters(db: Db, meterIds: string[]) {
  const run = latestCompletedRun(db);
  if (!run || meterIds.length === 0) return [];
  return db
    .select()
    .from(anomalies)
    .where(and(eq(anomalies.analysisRunId, run.id), inArray(anomalies.meterId, meterIds)))
    .orderBy(desc(anomalies.priorityScore))
    .all();
}

import { and, asc, count, eq, gte, lte, sql, sum, type SQL } from 'drizzle-orm';
import { meterStatus, type MeterSummary } from '@aiem/engine';
import {
  ACTIVE_ANOMALY_STATUSES,
  type MeterDetail,
  type MeterListItem,
  type MeterListQuery,
  type Reading,
} from '@aiem/shared';
import type { Db } from '../db/client.js';
import { events, meters, readings } from '../db/schema.js';
import { currentAnomaliesForMeters, type AnomalyRow } from './anomalies.js';
import { latestCompletedRun } from './runs.js';

const SEVERITY_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
const STATUS_RANK = { CRITICAL: 3, ALERT: 2, OK: 1 } as const;

const anomalyRef = (a: AnomalyRow) => ({
  id: a.id,
  type: a.type,
  severity: a.severity,
  status: a.status,
});

const isActive = (a: AnomalyRow) => ACTIVE_ANOMALY_STATUSES.includes(a.status);

function readingStats(db: Db) {
  return new Map(
    db
      .select({ meterId: readings.meterId, n: count(), kwh: sum(readings.consumptionKwh) })
      .from(readings)
      .groupBy(readings.meterId)
      .all()
      .map((r) => [r.meterId, { readings: r.n, kwh: Number(r.kwh ?? 0) }]),
  );
}

function buildItems(db: Db) {
  const stats = readingStats(db);
  const summaries = new Map(
    (latestCompletedRun(db)?.meterSummaries ?? []).map((s) => [s.meterId, s] as const),
  );
  const rows = db.select().from(meters).orderBy(asc(meters.meterId)).all();
  const anomalies = currentAnomaliesForMeters(
    db,
    rows.map((m) => m.meterId),
  );

  return rows.map((m) => {
    const own = anomalies.filter((a) => a.meterId === m.meterId);
    const summary: MeterSummary | undefined = summaries.get(m.meterId);
    const item: MeterListItem = {
      meterId: m.meterId,
      name: m.name,
      location: m.location,
      status: m.status,
      readings: stats.get(m.meterId)?.readings ?? 0,
      periodConsumptionKwh: Math.round((stats.get(m.meterId)?.kwh ?? 0) * 10) / 10,
      current: summary?.current ?? null,
      topAnomaly: own.find(isActive) ? anomalyRef(own.find(isActive)!) : null,
    };
    return { item, summary, anomalies: own };
  });
}

export function listMeters(db: Db, query: MeterListQuery): MeterListItem[] {
  const search = query.search?.toLowerCase();
  const items = buildItems(db)
    .map((x) => x.item)
    .filter((m) => !query.status || m.status === query.status)
    .filter(
      (m) =>
        !search ||
        m.meterId.toLowerCase().includes(search) ||
        m.name.toLowerCase().includes(search),
    );

  const key: Record<MeterListQuery['sort'], (m: MeterListItem) => number | string> = {
    meterId: (m) => m.meterId,
    consumption: (m) => m.current?.consumptionKwh ?? m.periodConsumptionKwh,
    variation: (m) => m.current?.variation ?? 0,
    severity: (m) =>
      STATUS_RANK[m.status] * 10 + (m.topAnomaly ? SEVERITY_RANK[m.topAnomaly.severity] : 0),
  };
  const pick = key[query.sort];
  const direction = query.order === 'desc' ? -1 : 1;
  return items.sort((a, b) => {
    const [x, y] = [pick(a), pick(b)];
    const cmp = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number);
    return cmp * direction || a.meterId.localeCompare(b.meterId);
  });
}

export function getMeter(db: Db, meterId: string): MeterDetail | null {
  const found = buildItems(db).find((x) => x.item.meterId === meterId);
  if (!found) return null;
  return {
    ...found.item,
    baselineDayKwh: found.summary?.baselineDayKwh ?? null,
    baselineProfile: found.summary?.baselineProfile ?? null,
    anomalies: found.anomalies.map(anomalyRef),
    events: db
      .select({
        id: events.id,
        timestamp: events.timestamp,
        type: events.type,
        description: events.description,
      })
      .from(events)
      .where(eq(events.meterId, meterId))
      .orderBy(asc(events.timestamp))
      .all(),
  };
}

export function listReadings(
  db: Db,
  meterId: string,
  range: { from?: string | undefined; to?: string | undefined },
): Reading[] {
  const conditions: SQL[] = [eq(readings.meterId, meterId)];
  if (range.from) conditions.push(gte(readings.timestamp, new Date(range.from).toISOString()));
  if (range.to) conditions.push(lte(readings.timestamp, new Date(range.to).toISOString()));
  return db
    .select({
      timestamp: readings.timestamp,
      consumptionKwh: readings.consumptionKwh,
      voltageV: readings.voltageV,
      currentA: readings.currentA,
      powerFactor: readings.powerFactor,
    })
    .from(readings)
    .where(and(...conditions))
    .orderBy(asc(readings.timestamp))
    .all();
}

export function meterExists(db: Db, meterId: string): boolean {
  return (
    db.select({ id: meters.id }).from(meters).where(eq(meters.meterId, meterId)).get() !== undefined
  );
}

/**
 * Estado de cada medidor (A9) a partir de sus anomalías vigentes que siguen activas: si el usuario
 * resuelve o descarta una anomalía, el medidor deja de estar en alerta.
 */
export function recomputeMeterStatuses(db: Db): void {
  const rows = db.select({ meterId: meters.meterId }).from(meters).all();
  const anomalies = currentAnomaliesForMeters(
    db,
    rows.map((r) => r.meterId),
  ).filter(isActive);
  for (const { meterId } of rows) {
    const status = meterStatus(anomalies.filter((a) => a.meterId === meterId));
    db.update(meters).set({ status }).where(eq(meters.meterId, meterId)).run();
  }
}

export function consumptionOverview(db: Db) {
  const day = sql<string>`substr(${readings.timestamp}, 1, 10)`;
  const daily = db
    .select({ date: day, kwh: sum(readings.consumptionKwh) })
    .from(readings)
    .groupBy(day)
    .orderBy(day)
    .all()
    .map((d) => ({ date: d.date, kwh: Math.round(Number(d.kwh ?? 0) * 10) / 10 }));
  const period = db
    .select({
      from: sql<string | null>`min(${readings.timestamp})`,
      to: sql<string | null>`max(${readings.timestamp})`,
    })
    .from(readings)
    .get();
  return {
    totalKwh: Math.round(daily.reduce((acc, d) => acc + d.kwh, 0) * 10) / 10,
    periodStart: period?.from ?? null,
    periodEnd: period?.to ?? null,
    daily,
  };
}

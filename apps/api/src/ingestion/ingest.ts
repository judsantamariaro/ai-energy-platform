import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { count } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { events, meters, readings } from '../db/schema.js';
import {
  countMissingValues,
  parseEventsCsv,
  parseReadingsCsv,
  type ParsedCsv,
  type Rejection,
} from './parse.js';

/** Metadatos de los medidores que no vienen en los CSV (nombre y ubicación). */
export const MeterSeed = z.array(
  z.object({
    meter_id: z.string().min(1),
    name: z.string().min(1),
    location: z.string().min(1),
  }),
);
export type MeterSeed = z.infer<typeof MeterSeed>;

export interface DatasetInput {
  readingsCsv: string;
  eventsCsv: string;
  meters: MeterSeed;
}

export interface FileReport {
  total: number;
  inserted: number;
  duplicates: number;
  rejected: number;
}

export interface IngestionReport {
  meters: { total: number; inserted: number; withoutMetadata: string[] };
  readings: FileReport & { missingValues: number };
  events: FileReport;
  period: { from: string; to: string } | null;
  rejections: (Rejection & { file: 'readings.csv' | 'events.csv' })[];
}

const INSERT_CHUNK = 500;
const MAX_REPORTED_REJECTIONS = 100;

export function loadDatasetFromDir(dir: string): DatasetInput {
  const read = (file: string) => readFileSync(join(dir, file), 'utf8');
  return {
    readingsCsv: read('readings.csv'),
    eventsCsv: read('events.csv'),
    meters: MeterSeed.parse(JSON.parse(read('meters.json'))),
  };
}

export function isDatabaseEmpty(db: Db): boolean {
  const [row] = db.select({ n: count() }).from(readings).all();
  return (row?.n ?? 0) === 0;
}

function fileReport<T>(parsed: ParsedCsv<T>, inserted: number): FileReport {
  return {
    total: parsed.total,
    inserted,
    duplicates: parsed.duplicates,
    rejected: parsed.rejections.length,
  };
}

/**
 * Carga medidores, lecturas y eventos en una sola transacción.
 * Es idempotente: las filas que ya existen (misma clave natural) se ignoran.
 */
export function ingestDataset(db: Db, input: DatasetInput, now = new Date()): IngestionReport {
  const parsedReadings = parseReadingsCsv(input.readingsCsv);
  const parsedEvents = parseEventsCsv(input.eventsCsv);

  // Todo medidor referenciado en los datos se registra; si no tiene metadatos, usa su id como nombre.
  const seedById = new Map(input.meters.map((m) => [m.meter_id, m]));
  const referenced = new Set([
    ...input.meters.map((m) => m.meter_id),
    ...parsedReadings.rows.map((r) => r.meterId),
    ...parsedEvents.rows.map((e) => e.meterId),
  ]);
  const withoutMetadata = [...referenced].filter((id) => !seedById.has(id)).sort();
  const meterRows = [...referenced].sort().map((meterId) => ({
    meterId,
    name: seedById.get(meterId)?.name ?? meterId,
    location: seedById.get(meterId)?.location ?? null,
    createdAt: now.toISOString(),
  }));

  const inserted = db.transaction((tx) => {
    const insertChunked = <T>(rows: T[], insert: (chunk: T[]) => { changes: number }) => {
      let changes = 0;
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        changes += insert(rows.slice(i, i + INSERT_CHUNK)).changes;
      }
      return changes;
    };

    return {
      meters: insertChunked(meterRows, (chunk) =>
        tx.insert(meters).values(chunk).onConflictDoNothing().run(),
      ),
      readings: insertChunked(parsedReadings.rows, (chunk) =>
        tx.insert(readings).values(chunk).onConflictDoNothing().run(),
      ),
      events: insertChunked(parsedEvents.rows, (chunk) =>
        tx.insert(events).values(chunk).onConflictDoNothing().run(),
      ),
    };
  });

  const timestamps = parsedReadings.rows.map((r) => r.timestamp).sort();
  const rejections = [
    ...parsedReadings.rejections.map((r) => ({ ...r, file: 'readings.csv' as const })),
    ...parsedEvents.rejections.map((r) => ({ ...r, file: 'events.csv' as const })),
  ];

  return {
    meters: { total: meterRows.length, inserted: inserted.meters, withoutMetadata },
    readings: {
      ...fileReport(parsedReadings, inserted.readings),
      missingValues: countMissingValues(parsedReadings.rows),
    },
    events: fileReport(parsedEvents, inserted.events),
    period: timestamps.length > 0 ? { from: timestamps[0]!, to: timestamps.at(-1)! } : null,
    rejections: rejections.slice(0, MAX_REPORTED_REJECTIONS),
  };
}

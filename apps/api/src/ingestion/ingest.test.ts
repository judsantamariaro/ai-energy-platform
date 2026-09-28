import { resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../config.js';
import { openDatabase, type DatabaseHandle } from '../db/client.js';
import { events, meters, readings } from '../db/schema.js';
import { ingestDataset, isDatabaseEmpty, loadDatasetFromDir } from './ingest.js';

let database: DatabaseHandle;

beforeEach(() => {
  database = openDatabase(':memory:', config.migrationsDir);
});
afterEach(() => database.close());

describe('ingestDataset con los datasets entregados', () => {
  const dataset = loadDatasetFromDir(resolve(config.dataDir));

  it('carga 12 medidores, 4.032 lecturas y 4 eventos sin rechazos', () => {
    expect(isDatabaseEmpty(database.db)).toBe(true);

    const report = ingestDataset(database.db, dataset);

    expect(report.meters).toEqual({ total: 12, inserted: 12, withoutMetadata: [] });
    expect(report.readings).toEqual({
      total: 4032,
      inserted: 4032,
      duplicates: 0,
      rejected: 0,
      missingValues: 0,
    });
    expect(report.events).toEqual({ total: 4, inserted: 4, duplicates: 0, rejected: 0 });
    expect(report.period).toEqual({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-14T23:00:00.000Z',
    });
    expect(isDatabaseEmpty(database.db)).toBe(false);
  });

  it('es idempotente: una segunda carga no inserta nada', () => {
    ingestDataset(database.db, dataset);
    const second = ingestDataset(database.db, dataset);

    expect(second.meters.inserted).toBe(0);
    expect(second.readings.inserted).toBe(0);
    expect(second.events.inserted).toBe(0);
    expect(database.db.select().from(readings).all()).toHaveLength(4032);
  });

  it('guarda las lecturas eléctricamente inconsistentes de M-112 tal cual', () => {
    ingestDataset(database.db, dataset);
    const [row] = database.db
      .select()
      .from(readings)
      .where(and(eq(readings.meterId, 'M-112'), eq(readings.timestamp, '2026-09-13T06:00:00.000Z')))
      .all();

    expect(row).toMatchObject({ voltageV: 202.75, powerFactor: 0.58 });
  });

  it('guarda los eventos con su tipo original, incluido UNKNOWN', () => {
    ingestDataset(database.db, dataset);
    const types = database.db.select({ type: events.type }).from(events).all();
    expect(types.map((t) => t.type).sort()).toEqual([
      'DATA_QUALITY',
      'OPERATIONAL_CHANGE',
      'SCHEDULED_OUTAGE',
      'UNKNOWN',
    ]);
  });
});

describe('ingestDataset con medidores sin metadatos', () => {
  it('registra el medidor con su id como nombre y lo reporta', () => {
    const report = ingestDataset(database.db, {
      readingsCsv:
        'meter_id,timestamp,consumption_kwh,voltage_v,current_a,power_factor,status\n' +
        'M-999,2026-09-01 00:00:00,1,220,5,0.9,OK',
      eventsCsv: 'meter_id,event_timestamp,event_type,description\n',
      meters: [],
    });

    expect(report.meters.withoutMetadata).toEqual(['M-999']);
    expect(database.db.select().from(meters).all()).toMatchObject([
      { meterId: 'M-999', name: 'M-999', location: null, status: 'OK' },
    ]);
  });
});

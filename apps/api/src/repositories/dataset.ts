import type { EventInput, ReadingInput } from '@aiem/engine';
import type { MeterContext } from '@aiem/ai';
import type { Db } from '../db/client.js';
import { events, meters, readings } from '../db/schema.js';

/** Todo lo que necesita el motor para analizar, leído de la base. */
export function loadAnalysisInput(db: Db): {
  readings: ReadingInput[];
  events: EventInput[];
  meters: Record<string, MeterContext>;
} {
  return {
    readings: db
      .select({
        meterId: readings.meterId,
        timestamp: readings.timestamp,
        consumptionKwh: readings.consumptionKwh,
        voltageV: readings.voltageV,
        currentA: readings.currentA,
        powerFactor: readings.powerFactor,
      })
      .from(readings)
      .all(),
    events: db.select().from(events).all(),
    meters: Object.fromEntries(
      db
        .select()
        .from(meters)
        .all()
        .map((m) => [m.meterId, { name: m.name, location: m.location }]),
    ),
  };
}

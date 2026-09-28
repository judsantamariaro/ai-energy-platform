import { HOUR_MS } from './stats.js';
import type { ReadingInput } from './types.js';

export interface Point {
  t: number;
  iso: string;
  hour: number;
  kwh: number | null;
  voltage: number | null;
  current: number | null;
  pf: number | null;
  /**
   * Relación física k = kWh / (V·I·PF / 1000). En un medidor sano es casi constante; si cambia
   * de forma estable indica un cambio eléctrico, y si se vuelve errática, datos inconsistentes.
   */
  ratio: number | null;
}

export interface MeterSeries {
  meterId: string;
  points: Point[];
}

function physicalRatio(r: ReadingInput): number | null {
  const { consumptionKwh: kwh, voltageV: v, currentA: i, powerFactor: pf } = r;
  if (kwh === null || v === null || i === null || pf === null) return null;
  const kw = (v * i * pf) / 1000;
  return kw > 0 ? kwh / kw : null;
}

/** Agrupa las lecturas por medidor y las ordena en el tiempo. */
export function buildSeries(readings: ReadingInput[]): MeterSeries[] {
  const byMeter = new Map<string, Point[]>();
  for (const r of readings) {
    const t = Date.parse(r.timestamp);
    if (Number.isNaN(t)) continue;
    const points = byMeter.get(r.meterId) ?? [];
    points.push({
      t,
      iso: new Date(t).toISOString(),
      hour: new Date(t).getUTCHours(),
      kwh: r.consumptionKwh,
      voltage: r.voltageV,
      current: r.currentA,
      pf: r.powerFactor,
      ratio: physicalRatio(r),
    });
    byMeter.set(r.meterId, points);
  }

  return [...byMeter.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([meterId, points]) => ({ meterId, points: points.sort((a, b) => a.t - b.t) }));
}

export function hoursBetween(a: Point, b: Point): number {
  return (b.t - a.t) / HOUR_MS;
}

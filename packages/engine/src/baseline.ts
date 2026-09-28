import type { MeterSeries, Point } from './series.js';
import { isPresent, mad, median } from './stats.js';

/**
 * Baseline de un medidor (A1): mediana por hora del día sobre todo el periodo.
 * La mediana es robusta mientras los tramos anómalos sean minoría en la serie.
 */
export interface Baseline {
  kwhByHour: (number | null)[];
  voltageByHour: (number | null)[];
  pfByHour: (number | null)[];
  /** Mediana de voltaje del medidor (referencia para la banda de calidad de datos). */
  voltage: number | null;
  /** Mediana de k = kWh / (V·I·PF) del medidor. */
  ratio: number | null;
  /** Consumo de un día típico: suma de las medianas horarias. */
  dayKwh: number;
  /** Ruido del consumo: σ robusta de la desviación horaria relativa frente al baseline. */
  noise: number;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function medianByHour(points: Point[], pick: (p: Point) => number | null): (number | null)[] {
  const buckets = HOURS.map(() => [] as number[]);
  for (const p of points) {
    const value = pick(p);
    if (isPresent(value)) buckets[p.hour]!.push(value);
  }
  return buckets.map((values) => median(values));
}

export function expectedKwh(baseline: Baseline, point: Point): number | null {
  return baseline.kwhByHour[point.hour] ?? null;
}

/** Desviación relativa del consumo de una lectura frente al baseline de su hora. */
export function consumptionDeviation(baseline: Baseline, point: Point): number | null {
  const expected = expectedKwh(baseline, point);
  if (point.kwh === null || expected === null || expected <= 0) return null;
  return point.kwh / expected - 1;
}

export function computeBaseline(series: MeterSeries): Baseline {
  const { points } = series;
  const kwhByHour = medianByHour(points, (p) => p.kwh);

  const baseline: Baseline = {
    kwhByHour,
    voltageByHour: medianByHour(points, (p) => p.voltage),
    pfByHour: medianByHour(points, (p) => p.pf),
    voltage: median(points.map((p) => p.voltage).filter(isPresent)),
    ratio: median(points.map((p) => p.ratio).filter(isPresent)),
    dayKwh: kwhByHour.reduce<number>((acc, v) => acc + (v ?? 0), 0),
    noise: 0,
  };

  const deviations = points.map((p) => consumptionDeviation(baseline, p)).filter(isPresent);
  // 1,4826 · MAD estima la desviación estándar si el ruido fuera normal.
  baseline.noise = 1.4826 * (mad(deviations) ?? 0);
  return baseline;
}

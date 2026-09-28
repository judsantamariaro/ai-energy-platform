export const HOUR_MS = 3_600_000;

export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export function mean(values: number[]): number | null {
  return values.length === 0 ? null : sum(values) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Desviación absoluta mediana: medida de dispersión robusta a valores extremos. */
export function mad(values: number[]): number | null {
  const m = median(values);
  if (m === null) return null;
  return median(values.map((v) => Math.abs(v - m)));
}

/** Medias móviles de `window` elementos consecutivos; si hay menos, la media de todos. */
export function rollingMeans(values: number[], window: number): number[] {
  if (values.length === 0) return [];
  if (values.length <= window) return [mean(values)!];
  const out: number[] = [];
  for (let i = 0; i + window <= values.length; i++) out.push(mean(values.slice(i, i + window))!);
  return out;
}

/**
 * Mínimo y máximo en una pasada. `Math.min(...values)` desborda la pila con cientos de miles
 * de elementos (p. ej. más de un año de lecturas horarias de varios medidores).
 */
export function minMax(values: number[]): { min: number; max: number } | null {
  if (values.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/** El valor de mayor magnitud (conserva el signo). */
export function maxByMagnitude(values: number[]): number | null {
  return values.reduce<number | null>(
    (best, v) => (best === null || Math.abs(v) > Math.abs(best) ? v : best),
    null,
  );
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function roundOrNull(value: number | null, decimals: number): number | null {
  return value === null ? null : round(value, decimals);
}

export function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

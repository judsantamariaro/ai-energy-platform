import { consumptionDeviation, expectedKwh, type Baseline } from '../baseline.js';
import type { EngineConfig } from '../config.js';
import type { MeterSeries, Point } from '../series.js';
import { isPresent, maxByMagnitude, sum } from '../stats.js';
import { durationHours, groupFlagged, isOngoing } from './windows.js';

export interface ConsumptionIncident {
  meterId: string;
  direction: 'UP' | 'DOWN';
  /** Lecturas de la ventana, incluidas las no marcadas que quedan entre marcas. */
  points: Point[];
  flaggedHours: number;
  durationHours: number;
  ongoing: boolean;
  observedKwh: number;
  expectedKwh: number;
  /** Desviación agregada de la ventana: observado / esperado − 1. */
  meanDeviation: number;
  peakDeviation: number;
}

/** Consumo agregado de un tramo frente a lo que el baseline espera para esas horas. */
export function windowConsumption(baseline: Baseline, points: Point[]) {
  const pairs = points
    .map((p) => ({ observed: p.kwh, expected: expectedKwh(baseline, p) }))
    .filter(
      (x): x is { observed: number; expected: number } =>
        isPresent(x.observed) && isPresent(x.expected),
    );
  const observedKwh = sum(pairs.map((x) => x.observed));
  const expected = sum(pairs.map((x) => x.expected));
  return {
    observedKwh,
    expectedKwh: expected,
    meanDeviation: expected > 0 ? observedKwh / expected - 1 : null,
  };
}

/**
 * Detector de consumo (A2): horas con |desviación| > umbral, agrupadas en incidentes por
 * dirección (un aumento y una caída nunca se mezclan en el mismo incidente).
 */
export function detectConsumptionIncidents(
  series: MeterSeries,
  baseline: Baseline,
  config: EngineConfig,
): ConsumptionIncident[] {
  const { deviationThreshold, maxGapHours, minFlaggedHours } = config.consumption;
  const { points } = series;
  const deviations = points.map((p) => consumptionDeviation(baseline, p));

  const directions = [
    { direction: 'UP' as const, flagged: (d: number) => d > deviationThreshold },
    { direction: 'DOWN' as const, flagged: (d: number) => d < -deviationThreshold },
  ];

  return directions
    .flatMap(({ direction, flagged }) =>
      groupFlagged(
        points,
        (_, i) => {
          const d = deviations[i];
          return isPresent(d) && flagged(d);
        },
        maxGapHours,
        minFlaggedHours,
      ).map((window): ConsumptionIncident => {
        const windowPoints = points.slice(window.startIndex, window.endIndex + 1);
        const totals = windowConsumption(baseline, windowPoints);
        return {
          meterId: series.meterId,
          direction,
          points: windowPoints,
          flaggedHours: window.flaggedCount,
          durationHours: durationHours(points, window),
          ongoing: isOngoing(points, window, maxGapHours),
          observedKwh: totals.observedKwh,
          expectedKwh: totals.expectedKwh,
          meanDeviation: totals.meanDeviation ?? 0,
          peakDeviation:
            maxByMagnitude(
              deviations.slice(window.startIndex, window.endIndex + 1).filter(isPresent),
            ) ?? 0,
        };
      }),
    )
    .sort((a, b) => a.points[0]!.t - b.points[0]!.t);
}

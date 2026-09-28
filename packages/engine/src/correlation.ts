import type { Baseline } from './baseline.js';
import type { EngineConfig } from './config.js';
import type { Point } from './series.js';
import { isPresent, maxByMagnitude, mean, median, minMax, rollingMeans } from './stats.js';
import type { ElectricalEvidence, SignalCode } from './types.js';

export interface ElectricalSignature {
  evidence: ElectricalEvidence;
  signals: SignalCode[];
}

/** Diferencias lectura a lectura frente al baseline de la misma hora, sin valores faltantes. */
function hourlyDiffs(
  points: Point[],
  pick: (p: Point) => number | null,
  byHour: (number | null)[],
  diff: (observed: number, expected: number) => number,
) {
  const observed: number[] = [];
  const expected: number[] = [];
  const diffs: number[] = [];
  for (const p of points) {
    const o = pick(p);
    const e = byHour[p.hour];
    if (!isPresent(o) || !isPresent(e)) continue;
    observed.push(o);
    expected.push(e);
    diffs.push(diff(o, e));
  }
  return { observed: mean(observed), expected: mean(expected), diffs };
}

/**
 * Firma eléctrica de un incidente de consumo (A3, etapa de correlación). Compara PF, voltaje y la
 * relación física k dentro de la ventana contra el baseline del medidor. Para PF y voltaje se usa
 * el peor tramo de la media móvil, así un cambio que dura unas horas no se diluye en la ventana.
 */
export function electricalSignature(
  points: Point[],
  baseline: Baseline,
  config: EngineConfig,
): ElectricalSignature {
  const { rollingWindowHours, powerFactorDrop, voltageShift, physicalRatioShift } =
    config.electrical;

  const pf = hourlyDiffs(
    points,
    (p) => p.pf,
    baseline.pfByHour,
    (o, e) => o - e,
  );
  const pfWorst = minMax(rollingMeans(pf.diffs, rollingWindowHours))?.min ?? null;

  const voltage = hourlyDiffs(
    points,
    (p) => p.voltage,
    baseline.voltageByHour,
    (o, e) => o / e - 1,
  );
  const voltageWorst = maxByMagnitude(rollingMeans(voltage.diffs, rollingWindowHours));

  const ratioObserved = median(points.map((p) => p.ratio).filter(isPresent));
  const ratioShift =
    ratioObserved !== null && baseline.ratio !== null && baseline.ratio > 0
      ? ratioObserved / baseline.ratio - 1
      : null;

  const evidence: ElectricalEvidence = {
    powerFactor: {
      baseline: pf.expected,
      observed: pf.observed,
      delta: pf.observed !== null && pf.expected !== null ? pf.observed - pf.expected : null,
      worstRollingDelta: pfWorst,
      degraded: pfWorst !== null && pfWorst < -powerFactorDrop,
    },
    voltage: {
      baseline: voltage.expected,
      observed: voltage.observed,
      deviation: mean(voltage.diffs),
      worstRollingDeviation: voltageWorst,
      shifted: voltageWorst !== null && Math.abs(voltageWorst) > voltageShift,
    },
    physicalRatio: {
      baseline: baseline.ratio,
      observed: ratioObserved,
      shift: ratioShift,
      shifted: ratioShift !== null && Math.abs(ratioShift) > physicalRatioShift,
    },
  };

  const signals: SignalCode[] = [];
  if (evidence.powerFactor.degraded) signals.push('POWER_FACTOR_DEGRADATION');
  if (evidence.voltage.shifted) signals.push('VOLTAGE_SHIFT');
  if (evidence.physicalRatio.shifted) signals.push('PHYSICAL_RATIO_SHIFT');

  return { evidence, signals };
}

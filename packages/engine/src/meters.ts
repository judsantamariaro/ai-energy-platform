import type { MeterStatus } from '@aiem/shared';
import { expectedKwh, type Baseline } from './baseline.js';
import type { EngineConfig } from './config.js';
import type { MeterSeries } from './series.js';
import { HOUR_MS, isPresent, round, sum } from './stats.js';
import type { Finding, MeterSummary } from './types.js';

/**
 * Estado del medidor (A9): CRITICAL si tiene una anomalía real HIGH; ALERT si tiene cualquier otro
 * hallazgo que no sea un falso positivo; OK en los demás casos.
 */
export function meterStatus(findings: Finding[]): MeterStatus {
  if (findings.some((f) => f.type === 'REAL_ANOMALY' && f.severity === 'HIGH')) return 'CRITICAL';
  if (findings.some((f) => f.type !== 'FALSE_POSITIVE')) return 'ALERT';
  return 'OK';
}

/** Consumo del periodo y consumo actual (A8): últimas N horas frente al baseline de esas horas. */
export function summarizeMeter(
  series: MeterSeries,
  baseline: Baseline,
  findings: Finding[],
  config: EngineConfig,
): MeterSummary {
  const { points } = series;
  const last = points.at(-1);
  const windowHours = config.current.windowHours;

  let current: MeterSummary['current'] = null;
  if (last) {
    const recent = points.filter((p) => p.t > last.t - windowHours * HOUR_MS);
    const consumptionKwh = sum(recent.map((p) => p.kwh).filter(isPresent));
    const baselineKwh = sum(recent.map((p) => expectedKwh(baseline, p)).filter(isPresent));
    current = {
      windowHours,
      consumptionKwh: round(consumptionKwh, 1),
      baselineKwh: round(baselineKwh, 1),
      variation: baselineKwh > 0 ? round(consumptionKwh / baselineKwh - 1, 4) : 0,
    };
  }

  return {
    meterId: series.meterId,
    status: meterStatus(findings),
    readings: points.length,
    periodConsumptionKwh: round(sum(points.map((p) => p.kwh).filter(isPresent)), 1),
    baselineDayKwh: round(baseline.dayKwh, 1),
    current,
  };
}

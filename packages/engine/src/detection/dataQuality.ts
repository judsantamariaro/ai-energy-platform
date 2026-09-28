import type { Baseline } from '../baseline.js';
import type { EngineConfig } from '../config.js';
import { hoursBetween, type MeterSeries, type Point } from '../series.js';
import { isPresent, mad } from '../stats.js';
import type { DataQualityEvidence, SignalCode } from '../types.js';
import { windowConsumption } from './consumption.js';
import { durationHours, groupFlagged, isOngoing } from './windows.js';

export interface DataQualityIncident {
  meterId: string;
  points: Point[];
  durationHours: number;
  ongoing: boolean;
  signals: SignalCode[];
  evidence: DataQualityEvidence;
}

interface PointFlags {
  outOfBand: boolean;
  jump: boolean;
  ratioOutlier: boolean;
}

function flagPoints(points: Point[], baseline: Baseline, config: EngineConfig): PointFlags[] {
  const { voltageBand, voltageJumpV, ratioOutlier } = config.dataQuality;

  return points.map((p, i) => {
    const prev = points[i - 1];
    const contiguous = prev !== undefined && hoursBetween(prev, p) === 1;
    return {
      outOfBand:
        p.voltage !== null &&
        baseline.voltage !== null &&
        Math.abs(p.voltage / baseline.voltage - 1) > voltageBand,
      jump:
        contiguous &&
        p.voltage !== null &&
        prev.voltage !== null &&
        Math.abs(p.voltage - prev.voltage) > voltageJumpV,
      ratioOutlier:
        p.ratio !== null &&
        baseline.ratio !== null &&
        Math.abs(p.ratio / baseline.ratio - 1) > ratioOutlier,
    };
  });
}

/**
 * Detector de calidad de datos (A3). Marca lecturas con voltaje fuera de banda, saltos bruscos de
 * voltaje o una relación física k anómala, las agrupa en ventanas y exige que coincidan al menos
 * `minSignals` señales distintas. Un k desplazado pero estable (cambio eléctrico real) no cuenta:
 * lo que delata datos inconsistentes es la dispersión.
 */
export function detectDataQualityIncidents(
  series: MeterSeries,
  baseline: Baseline,
  config: EngineConfig,
): DataQualityIncident[] {
  const dq = config.dataQuality;
  const { points } = series;
  const flags = flagPoints(points, baseline, config);

  const windows = groupFlagged(
    points,
    (_, i) => {
      const f = flags[i]!;
      return f.outOfBand || f.jump || f.ratioOutlier;
    },
    dq.maxGapHours,
    dq.minFlaggedReadings,
  );

  return windows.flatMap((window): DataQualityIncident[] => {
    const inside = points.slice(window.startIndex, window.endIndex + 1);
    const insideFlags = flags.slice(window.startIndex, window.endIndex + 1);
    const outside = [...points.slice(0, window.startIndex), ...points.slice(window.endIndex + 1)];

    const voltageOutOfBand = insideFlags.filter((f) => f.outOfBand).length;
    const voltageJumps = insideFlags.filter((f) => f.jump).length;
    const dispersionInside = mad(inside.map((p) => p.ratio).filter(isPresent));
    const dispersionOutside = mad(outside.map((p) => p.ratio).filter(isPresent));
    const dispersionRatio =
      dispersionInside !== null && dispersionOutside !== null && dispersionOutside > 0
        ? dispersionInside / dispersionOutside
        : null;

    const signals: SignalCode[] = [];
    if (voltageOutOfBand >= dq.minSignalReadings) signals.push('VOLTAGE_OUT_OF_BAND');
    if (voltageJumps >= dq.minSignalReadings) signals.push('VOLTAGE_JUMPS');
    if (dispersionRatio !== null && dispersionRatio > dq.dispersionRatio) {
      signals.push('PHYSICAL_RATIO_DISPERSION');
    }
    if (signals.length < dq.minSignals) return [];

    return [
      {
        meterId: series.meterId,
        points: inside,
        durationHours: durationHours(points, window),
        ongoing: isOngoing(points, window, dq.maxGapHours),
        signals,
        evidence: {
          readingsInWindow: inside.length,
          flaggedReadings: window.flaggedCount,
          flaggedShare: window.flaggedCount / inside.length,
          voltageOutOfBand,
          voltageJumps,
          ratioDispersion: {
            inside: dispersionInside,
            outside: dispersionOutside,
            ratio: dispersionRatio,
          },
          consumptionMeanDeviation: windowConsumption(baseline, inside).meanDeviation,
        },
      },
    ];
  });
}

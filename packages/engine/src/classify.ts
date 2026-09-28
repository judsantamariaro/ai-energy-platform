import type { AnomalyType, Severity } from '@aiem/shared';
import type { Baseline } from './baseline.js';
import type { EngineConfig } from './config.js';
import type { ElectricalSignature } from './correlation.js';
import type { ConsumptionIncident } from './detection/consumption.js';
import type { DataQualityIncident } from './detection/dataQuality.js';
import { confidence, factor, priority } from './scoring.js';
import { clamp01, round, roundOrNull } from './stats.js';
import type {
  ConfidenceFactor,
  ElectricalEvidence,
  EventEvidence,
  Finding,
  SignalCode,
  WindowEvidence,
} from './types.js';

const pct = (value: number) => `${value >= 0 ? '+' : ''}${round(value * 100, 1)} %`;

function windowEvidence(incident: {
  points: { iso: string }[];
  durationHours: number;
  ongoing: boolean;
}): WindowEvidence {
  return {
    start: incident.points[0]!.iso,
    end: incident.points.at(-1)!.iso,
    durationHours: incident.durationHours,
    ongoing: incident.ongoing,
  };
}

function roundElectrical(e: ElectricalEvidence): ElectricalEvidence {
  return {
    powerFactor: {
      ...e.powerFactor,
      baseline: roundOrNull(e.powerFactor.baseline, 3),
      observed: roundOrNull(e.powerFactor.observed, 3),
      delta: roundOrNull(e.powerFactor.delta, 3),
      worstRollingDelta: roundOrNull(e.powerFactor.worstRollingDelta, 3),
    },
    voltage: {
      ...e.voltage,
      baseline: roundOrNull(e.voltage.baseline, 1),
      observed: roundOrNull(e.voltage.observed, 1),
      deviation: roundOrNull(e.voltage.deviation, 4),
      worstRollingDeviation: roundOrNull(e.voltage.worstRollingDeviation, 4),
    },
    physicalRatio: {
      ...e.physicalRatio,
      baseline: roundOrNull(e.physicalRatio.baseline, 3),
      observed: roundOrNull(e.physicalRatio.observed, 3),
      shift: roundOrNull(e.physicalRatio.shift, 4),
    },
  };
}

/** Qué tan lejos está la desviación del ruido normal del medidor (5σ ⇒ 1). */
function strength(deviation: number, baseline: Baseline) {
  return baseline.noise > 0 ? Math.abs(deviation) / (5 * baseline.noise) : 1;
}

function durationFactor(events: EventEvidence[], weight: number) {
  const declared = events.find((e) => e.declaredDurationHours !== null);
  if (!declared)
    return factor('Duración declarada', 0.7, weight, 'El evento no declara una duración.');
  return declared.durationMatches
    ? factor(
        'Duración declarada',
        1,
        weight,
        `El evento declara ${declared.declaredDurationHours} h y coincide con lo observado.`,
      )
    : factor(
        'Duración declarada',
        0.3,
        weight,
        `El evento declara ${declared.declaredDurationHours} h, distinto de lo observado.`,
      );
}

function timingFactor(explaining: EventEvidence, config: EngineConfig, weight: number) {
  const offset = Math.abs(explaining.offsetHours);
  return factor(
    'Coincidencia temporal con el evento',
    1 - offset / Math.max(config.events.toleranceHours, 1),
    weight,
    offset === 0
      ? 'El evento coincide exactamente con el inicio del incidente.'
      : `El evento está a ${round(offset, 1)} h del inicio del incidente.`,
  );
}

/** Clasificación de un incidente de consumo (A4) con su severidad (A5) y confianza (A6). */
export function classifyConsumptionIncident(
  incident: ConsumptionIncident,
  electrical: ElectricalSignature,
  events: EventEvidence[],
  baseline: Baseline,
  config: EngineConfig,
): Finding {
  const explaining = events.find((e) => e.role === 'EXPLAINS');
  const type: AnomalyType = !explaining
    ? 'REAL_ANOMALY'
    : incident.direction === 'UP'
      ? 'EXPLAINABLE_ANOMALY'
      : 'FALSE_POSITIVE';

  const severity: Severity =
    type === 'FALSE_POSITIVE'
      ? 'LOW'
      : type === 'EXPLAINABLE_ANOMALY'
        ? 'MEDIUM'
        : Math.abs(incident.meanDeviation) > config.severity.realHighDeviation ||
            electrical.signals.length > 0
          ? 'HIGH'
          : 'MEDIUM';

  const magnitude = factor(
    'Magnitud frente al ruido',
    strength(incident.meanDeviation, baseline),
    0,
    `Desviación ${pct(incident.meanDeviation)} frente a un ruido típico de ±${round(baseline.noise * 100, 1)} %.`,
  );
  const persistence = factor(
    'Persistencia',
    incident.durationHours / 24,
    0,
    `${incident.durationHours} h${incident.ongoing ? ', sigue activo al final de los datos' : ''}.`,
  );
  const withWeight = (f: ConfidenceFactor, weight: number) => ({ ...f, weight });

  let factors: ConfidenceFactor[];
  if (type === 'REAL_ANOMALY') {
    const context = events.filter((e) => e.role === 'NOT_EXPLANATORY');
    factors = [
      withWeight(magnitude, 0.3),
      withWeight(persistence, 0.2),
      factor(
        'Señales eléctricas concordantes',
        electrical.signals.length / 3,
        0.25,
        electrical.signals.length > 0
          ? `${electrical.signals.length} de 3 variables eléctricas cambiaron junto con el consumo.`
          : 'Las variables eléctricas no cambiaron.',
      ),
      factor(
        'Sin explicación operativa',
        context.length === 0 ? 1 : 0.8,
        0.25,
        context.length === 0
          ? 'No hay eventos registrados cerca del inicio.'
          : 'Hay eventos cerca del inicio, pero ninguno explica el cambio.',
      ),
    ];
  } else if (type === 'EXPLAINABLE_ANOMALY') {
    factors = [
      withWeight(magnitude, 0.3),
      withWeight(persistence, 0.2),
      timingFactor(explaining!, config, 0.35),
      durationFactor([explaining!], 0.15),
    ];
  } else {
    factors = [
      timingFactor(explaining!, config, 0.35),
      durationFactor([explaining!], 0.25),
      factor('Recuperación al baseline', 1, 0.25, 'El consumo volvió a su nivel normal.'),
      withWeight(magnitude, 0.15),
    ];
  }

  const signals: SignalCode[] = [
    incident.direction === 'UP' ? 'CONSUMPTION_INCREASE' : 'CONSUMPTION_DROP',
    ...electrical.signals,
  ];
  const window = windowEvidence(incident);

  return {
    key: `${incident.meterId}|${type}|${window.start}`,
    meterId: incident.meterId,
    type,
    severity,
    confidence: confidence(factors),
    priorityScore: 0,
    windowStart: window.start,
    windowEnd: window.end,
    evidence: {
      signals,
      window,
      consumption: {
        direction: incident.direction,
        observedKwh: round(incident.observedKwh, 1),
        expectedKwh: round(incident.expectedKwh, 1),
        meanDeviation: round(incident.meanDeviation, 4),
        peakDeviation: round(incident.peakDeviation, 4),
      },
      electrical: roundElectrical(electrical.evidence),
      events,
      confidenceFactors: factors,
      priority: priority({
        type,
        severity,
        magnitude: Math.abs(incident.meanDeviation),
        signals: electrical.signals.length,
        ongoing: incident.ongoing,
      }),
    },
  };
}

/** Un problema de calidad de datos (A4 regla 1): HIGH si sigue activo al final de los datos. */
export function classifyDataQualityIncident(
  incident: DataQualityIncident,
  events: EventEvidence[],
  config: EngineConfig,
): Finding {
  const dq = incident.evidence;
  const severity: Severity = incident.ongoing ? 'HIGH' : 'MEDIUM';
  const consumptionDeviation = dq.consumptionMeanDeviation ?? 0;
  const corroborated = events.some((e) => e.role === 'CORROBORATES');

  const factors = [
    factor(
      'Señales de calidad concordantes',
      incident.signals.length / 3,
      0.35,
      `${incident.signals.length} de 3 señales de inconsistencia presentes.`,
    ),
    factor(
      'Lecturas afectadas',
      dq.flaggedShare,
      0.2,
      `${dq.flaggedReadings} de ${dq.readingsInWindow} lecturas de la ventana son inconsistentes.`,
    ),
    factor(
      'Consumo estable',
      1 - Math.abs(consumptionDeviation) / config.consumption.deviationThreshold,
      0.25,
      `El consumo se desvía ${pct(consumptionDeviation)} del baseline: el problema está en las variables eléctricas.`,
    ),
    factor(
      'Evento de calidad de datos registrado',
      corroborated ? 1 : 0.6,
      0.2,
      corroborated
        ? 'Un evento registrado confirma el problema.'
        : 'No hay un evento que lo confirme.',
    ),
  ];
  const window = windowEvidence(incident);

  return {
    key: `${incident.meterId}|DATA_QUALITY|${window.start}`,
    meterId: incident.meterId,
    type: 'DATA_QUALITY',
    severity,
    confidence: confidence(factors),
    priorityScore: 0,
    windowStart: window.start,
    windowEnd: window.end,
    evidence: {
      signals: incident.signals,
      window,
      dataQuality: {
        ...dq,
        flaggedShare: round(dq.flaggedShare, 4),
        ratioDispersion: {
          inside: roundOrNull(dq.ratioDispersion.inside, 4),
          outside: roundOrNull(dq.ratioDispersion.outside, 4),
          ratio: roundOrNull(dq.ratioDispersion.ratio, 2),
        },
        consumptionMeanDeviation: roundOrNull(dq.consumptionMeanDeviation, 4),
      },
      events,
      confidenceFactors: factors,
      priority: priority({
        type: 'DATA_QUALITY',
        severity,
        magnitude: clamp01(dq.flaggedShare),
        signals: incident.signals.length,
        ongoing: incident.ongoing,
      }),
    },
  };
}

import type { AnomalyType, MeterStatus, Severity } from '@aiem/shared';

/**
 * Convenciones:
 * - Timestamps en ISO 8601 UTC.
 * - Las magnitudes relativas son fracciones: 0.25 = 25 %.
 */

export interface ReadingInput {
  meterId: string;
  timestamp: string;
  consumptionKwh: number | null;
  voltageV: number | null;
  currentA: number | null;
  powerFactor: number | null;
}

export interface EventInput {
  id?: number;
  meterId: string;
  timestamp: string;
  type: string;
  description: string;
}

export type SignalCode =
  | 'CONSUMPTION_INCREASE'
  | 'CONSUMPTION_DROP'
  | 'POWER_FACTOR_DEGRADATION'
  | 'VOLTAGE_SHIFT'
  | 'PHYSICAL_RATIO_SHIFT'
  | 'VOLTAGE_OUT_OF_BAND'
  | 'VOLTAGE_JUMPS'
  | 'PHYSICAL_RATIO_DISPERSION';

export type EventRole = 'EXPLAINS' | 'CORROBORATES' | 'NOT_EXPLANATORY';

export interface EventEvidence {
  eventId: number | null;
  type: string;
  timestamp: string;
  description: string;
  /** Horas entre el evento y el inicio del incidente (negativo = antes). */
  offsetHours: number;
  role: EventRole;
  note: string;
  /** Duración que declara la descripción del evento ("for 12 hours"), si la hay. */
  declaredDurationHours: number | null;
  durationMatches: boolean | null;
}

export interface WindowEvidence {
  start: string;
  end: string;
  durationHours: number;
  /** El incidente sigue activo al final de los datos (no se observó recuperación). */
  ongoing: boolean;
}

export interface ConsumptionEvidence {
  direction: 'UP' | 'DOWN';
  observedKwh: number;
  expectedKwh: number;
  meanDeviation: number;
  peakDeviation: number;
}

export interface ElectricalEvidence {
  powerFactor: {
    baseline: number | null;
    observed: number | null;
    delta: number | null;
    worstRollingDelta: number | null;
    degraded: boolean;
  };
  voltage: {
    baseline: number | null;
    observed: number | null;
    deviation: number | null;
    worstRollingDeviation: number | null;
    shifted: boolean;
  };
  physicalRatio: {
    baseline: number | null;
    observed: number | null;
    shift: number | null;
    shifted: boolean;
  };
}

export interface DataQualityEvidence {
  readingsInWindow: number;
  flaggedReadings: number;
  flaggedShare: number;
  voltageOutOfBand: number;
  voltageJumps: number;
  ratioDispersion: { inside: number | null; outside: number | null; ratio: number | null };
  /** Desviación media del consumo en la ventana: cerca de 0 = consumo estable. */
  consumptionMeanDeviation: number | null;
}

export interface ConfidenceFactor {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

export interface PriorityBreakdown {
  /** Rango que corresponde al tipo y la severidad del hallazgo. */
  band: { min: number; max: number };
  /** Componentes de 0 a 1 que ubican el hallazgo dentro de su rango. */
  magnitude: number;
  risk: number;
  ongoing: number;
  /** Promedio ponderado de los componentes: 0 = inicio del rango, 1 = tope. */
  intensity: number;
  total: number;
}

export interface Evidence {
  signals: SignalCode[];
  window: WindowEvidence;
  consumption?: ConsumptionEvidence;
  electrical?: ElectricalEvidence;
  dataQuality?: DataQualityEvidence;
  events: EventEvidence[];
  confidenceFactors: ConfidenceFactor[];
  priority: PriorityBreakdown;
}

export interface Finding {
  /** Clave determinista: el mismo dato produce la misma clave en cada análisis. */
  key: string;
  meterId: string;
  type: AnomalyType;
  severity: Severity;
  confidence: number;
  priorityScore: number;
  windowStart: string;
  windowEnd: string;
  evidence: Evidence;
}

export interface MeterSummary {
  meterId: string;
  status: MeterStatus;
  readings: number;
  periodConsumptionKwh: number;
  baselineDayKwh: number;
  /** Consumo de las últimas N horas frente a lo esperado por el baseline para esas horas. */
  current: {
    windowHours: number;
    consumptionKwh: number;
    baselineKwh: number;
    variation: number;
  } | null;
}

export interface AnalysisSummary {
  metersAnalyzed: number;
  readingsAnalyzed: number;
  periodStart: string | null;
  periodEnd: string | null;
  totalConsumptionKwh: number;
  anomaliesDetected: number;
  highPriority: number;
  averageConfidence: number | null;
}

export interface AnalysisResult {
  /** Ordenados por prioridad, de mayor a menor. */
  findings: Finding[];
  meters: MeterSummary[];
  summary: AnalysisSummary;
}

import type {
  AnalysisStage,
  AnomalyStatus,
  AnomalyType,
  MeterStatus,
  Severity,
} from '@aiem/shared';
import type { EventRole, SignalCode } from '@aiem/engine';

export const ANOMALY_TYPE: Record<AnomalyType, string> = {
  REAL_ANOMALY: 'Anomalía real',
  EXPLAINABLE_ANOMALY: 'Anomalía explicable',
  FALSE_POSITIVE: 'Falso positivo',
  DATA_QUALITY: 'Calidad de datos',
};

export const ANOMALY_TYPE_HINT: Record<AnomalyType, string> = {
  REAL_ANOMALY: 'Cambio sin una causa operativa registrada que lo explique.',
  EXPLAINABLE_ANOMALY: 'Cambio real, pero explicado por un evento operativo registrado.',
  FALSE_POSITIVE: 'El cambio lo explica un evento y el consumo volvió a lo normal.',
  DATA_QUALITY:
    'Las lecturas eléctricas son incoherentes: el problema está en el dato, no en la carga.',
};

export const SEVERITY: Record<Severity, string> = { HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' };

export const METER_STATUS: Record<MeterStatus, string> = {
  OK: 'Normal',
  ALERT: 'Alerta',
  CRITICAL: 'Crítico',
};

export const ANOMALY_STATUS: Record<AnomalyStatus, string> = {
  OPEN: 'Abierta',
  IN_PROGRESS: 'En investigación',
  RESOLVED: 'Resuelta',
  DISMISSED: 'Descartada',
};

export const STAGE: Record<AnalysisStage, { label: string; description: string }> = {
  READINGS: { label: 'Lecturas', description: 'Carga y ordena la serie horaria de cada medidor' },
  BASELINE: { label: 'Baseline', description: 'Perfil esperado por hora del día' },
  DETECTION: { label: 'Detección', description: 'Incidentes de consumo y de calidad de datos' },
  CORRELATION: {
    label: 'Correlación',
    description: 'Cambios en factor de potencia, voltaje y relación física',
  },
  EVENTS: { label: 'Eventos', description: 'Cruce con eventos operativos y clasificación' },
  EXPLANATION: {
    label: 'Explicación',
    description: 'Redacción del hallazgo a partir de la evidencia',
  },
  RECOMMENDATION: { label: 'Recomendación', description: 'Acción recomendada y priorización' },
};

export const SIGNAL: Record<SignalCode, string> = {
  CONSUMPTION_INCREASE: 'Aumento de consumo',
  CONSUMPTION_DROP: 'Caída de consumo',
  POWER_FACTOR_DEGRADATION: 'Factor de potencia degradado',
  VOLTAGE_SHIFT: 'Voltaje desplazado',
  PHYSICAL_RATIO_SHIFT: 'Relación kWh / V·I·PF alterada',
  VOLTAGE_OUT_OF_BAND: 'Voltaje fuera de banda',
  VOLTAGE_JUMPS: 'Saltos bruscos de voltaje',
  PHYSICAL_RATIO_DISPERSION: 'Relación kWh / V·I·PF errática',
};

export const EVENT_ROLE: Record<EventRole, string> = {
  EXPLAINS: 'Explica el cambio',
  CORROBORATES: 'Corrobora el hallazgo',
  NOT_EXPLANATORY: 'No explica el cambio',
};

/** Nivel de confianza en palabras, como en la tabla del enunciado. */
export function confidenceLevel(value: number): string {
  if (value >= 0.9) return 'Alta';
  if (value >= 0.75) return 'Media';
  return 'Baja';
}

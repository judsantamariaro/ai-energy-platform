import type { AnomalyStatus, AnomalyType, MeterStatus, Severity } from '@aiem/shared';

/** Colores semánticos compartidos por todas las insignias. */
export const TONE = {
  critical: 'bg-critical-soft text-critical ring-critical/25',
  alert: 'bg-alert-soft text-[oklch(0.5_0.12_60)] ring-alert/35',
  ok: 'bg-ok-soft text-ok ring-ok/25',
  info: 'bg-info-soft text-info ring-info/25',
  muted: 'bg-muted text-muted-foreground ring-border',
} as const;
export type Tone = keyof typeof TONE;

export const METER_TONE: Record<MeterStatus, Tone> = {
  CRITICAL: 'critical',
  ALERT: 'alert',
  OK: 'ok',
};
export const SEVERITY_TONE: Record<Severity, Tone> = {
  HIGH: 'critical',
  MEDIUM: 'alert',
  LOW: 'muted',
};
export const TYPE_TONE: Record<AnomalyType, Tone> = {
  REAL_ANOMALY: 'critical',
  DATA_QUALITY: 'info',
  EXPLAINABLE_ANOMALY: 'alert',
  FALSE_POSITIVE: 'muted',
};
export const ANOMALY_STATUS_TONE: Record<AnomalyStatus, Tone> = {
  OPEN: 'critical',
  IN_PROGRESS: 'info',
  RESOLVED: 'ok',
  DISMISSED: 'muted',
};

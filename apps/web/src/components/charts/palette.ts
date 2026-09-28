import type { AnomalyType } from '@aiem/shared';

/**
 * Paleta de los gráficos en hexadecimal: equivale a la del tema (index.css), pero ECharts no
 * interpreta colores oklch al calcular transparencias y tonos.
 */
export const CHART = {
  consumption: '#0e8a8c',
  baseline: '#8a94a6',
  voltage: '#d9901a',
  powerFactor: '#7c4dcc',
  current: '#3b7bd6',
  grid: '#e7eaf0',
  axis: '#6b7385',
  text: '#1f2533',
};

export const ANOMALY_COLOR: Record<AnomalyType, string> = {
  REAL_ANOMALY: '#d6453d',
  DATA_QUALITY: '#3b7bd6',
  EXPLAINABLE_ANOMALY: '#d9901a',
  FALSE_POSITIVE: '#8a94a6',
};

export const numberFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

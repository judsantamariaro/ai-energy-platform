import type { AnomalyType, Severity } from '@aiem/shared';
import { clamp01, round } from './stats.js';
import type { ConfidenceFactor, PriorityBreakdown } from './types.js';

/**
 * Rango de prioridad de cada combinación tipo/severidad que produce el clasificador. Los rangos no
 * se solapan, así que el orden de negocio queda garantizado: una anomalía real va antes que un
 * problema de calidad de datos (un consumo sin explicar cuesta dinero y puede ser un riesgo
 * físico; un dato corrupto es un problema del instrumento), y así hacia abajo.
 */
export const PRIORITY_BANDS: Record<string, readonly [min: number, max: number]> = {
  'REAL_ANOMALY/HIGH': [75, 100],
  'DATA_QUALITY/HIGH': [60, 75],
  'REAL_ANOMALY/MEDIUM': [45, 60],
  'DATA_QUALITY/MEDIUM': [35, 45],
  'EXPLAINABLE_ANOMALY/MEDIUM': [25, 35],
  'FALSE_POSITIVE/LOW': [0, 20],
};

/** Peso de cada componente al ubicar el hallazgo dentro de su rango. */
const INTENSITY_WEIGHTS = { magnitude: 0.4, risk: 0.35, ongoing: 0.25 };

/**
 * Prioridad de 0 a 100 (A5): rango según tipo y severidad, y posición dentro del rango según la
 * intensidad del hallazgo. Componentes, todos de 0 a 1 y guardados en la evidencia:
 * - magnitud: tamaño de la desviación del consumo o proporción de lecturas afectadas
 * - riesgo: señales concordantes (eléctricas o de calidad de datos) sobre 3
 * - vigencia: 1 si sigue activo al final de los datos
 * Un falso positivo no suma riesgo ni vigencia.
 */
export function priority(input: {
  type: AnomalyType;
  severity: Severity;
  magnitude: number;
  signals: number;
  ongoing: boolean;
}): PriorityBreakdown {
  const band = PRIORITY_BANDS[`${input.type}/${input.severity}`];
  if (!band) throw new Error(`Sin rango de prioridad para ${input.type}/${input.severity}`);
  const [min, max] = band;
  const isFalsePositive = input.type === 'FALSE_POSITIVE';

  const magnitude = clamp01(input.magnitude);
  const risk = isFalsePositive ? 0 : clamp01(input.signals / 3);
  const ongoing = input.ongoing && !isFalsePositive ? 1 : 0;
  const intensity =
    INTENSITY_WEIGHTS.magnitude * magnitude +
    INTENSITY_WEIGHTS.risk * risk +
    INTENSITY_WEIGHTS.ongoing * ongoing;

  return {
    band: { min, max },
    magnitude: round(magnitude, 3),
    risk: round(risk, 3),
    ongoing,
    intensity: round(intensity, 3),
    total: round(min + (max - min) * intensity, 1),
  };
}

/**
 * Confianza de 0,5 a 0,99 (A6): 0,5 + 0,49 × promedio ponderado de los factores. El piso de 0,5
 * refleja que, si el motor emite un hallazgo, ya superó los umbrales de detección.
 */
export function confidence(factors: ConfidenceFactor[]): number {
  const totalWeight = factors.reduce((acc, f) => acc + f.weight, 0);
  if (totalWeight === 0) return 0.5;
  const score = factors.reduce((acc, f) => acc + clamp01(f.score) * f.weight, 0) / totalWeight;
  return round(0.5 + 0.49 * score, 2);
}

export function factor(
  name: string,
  score: number,
  weight: number,
  detail: string,
): ConfidenceFactor {
  return { name, score: round(clamp01(score), 3), weight, detail };
}

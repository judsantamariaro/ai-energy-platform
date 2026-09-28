/**
 * Umbrales del motor. Se eligieron dejando al menos el doble de margen sobre el ruido del peor
 * medidor sano del dataset, no ajustándolos para que "salgan" los casos esperados.
 */
export const DEFAULT_CONFIG = {
  consumption: {
    /** Desviación horaria frente al baseline para marcar una hora (peor sano: 17 %). */
    deviationThreshold: 0.25,
    /** Horas marcadas necesarias para formar un incidente. */
    minFlaggedHours: 3,
    /** Horas sin marcar que se toleran dentro de un mismo incidente. */
    maxGapHours: 2,
  },
  electrical: {
    /** Ventana de la media móvil con la que se busca el peor tramo del incidente. */
    rollingWindowHours: 6,
    /** Caída del PF frente a su baseline horario (peor sano: −0,019). */
    powerFactorDrop: 0.05,
    /** Desviación del voltaje frente a su baseline horario (peor sano: 0,8 %). */
    voltageShift: 0.015,
    /** Cambio de la mediana de k = kWh / (V·I·PF) frente a la del medidor. */
    physicalRatioShift: 0.15,
  },
  dataQuality: {
    /** Banda de voltaje alrededor de la mediana del medidor (peor sano: 0 lecturas fuera). */
    voltageBand: 0.05,
    /** Salto de voltaje entre dos horas seguidas (peor sano: 5,6 V). */
    voltageJumpV: 10,
    /** Desvío de k de una lectura frente a la mediana del medidor (peor sano: 0 lecturas). */
    ratioOutlier: 0.35,
    /** Cuántas veces más dispersa debe ser k dentro de la ventana que fuera de ella. */
    dispersionRatio: 2,
    /** Mínimo de lecturas de una señal para contarla (fuera de banda, saltos). */
    minSignalReadings: 2,
    /** Señales distintas necesarias para declarar un problema de calidad de datos. */
    minSignals: 2,
    minFlaggedReadings: 3,
    /** Tolerancia entre lecturas marcadas: los problemas de calidad suelen ser intermitentes. */
    maxGapHours: 6,
  },
  events: {
    /** Distancia máxima entre el evento y el inicio del incidente. */
    toleranceHours: 2,
    /** Diferencia aceptada entre la duración declarada por el evento y la observada. */
    durationToleranceHours: 2,
    durationToleranceRelative: 0.2,
  },
  severity: {
    /** Desviación a partir de la cual una anomalía real es HIGH aunque no haya cambios eléctricos. */
    realHighDeviation: 0.5,
  },
  current: {
    /** Ventana del "consumo actual" (A8). */
    windowHours: 24,
  },
};

export type EngineConfig = typeof DEFAULT_CONFIG;

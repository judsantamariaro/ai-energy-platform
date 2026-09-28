/**
 * Motor analítico puro (sin HTTP ni base de datos):
 * lecturas → baseline → detección → correlación → eventos → hallazgos priorizados.
 */
export { analyze, type AnalyzeOptions, type EngineStage } from './analyze.js';
export { DEFAULT_CONFIG, type EngineConfig } from './config.js';
export { parseDeclaredDurationHours } from './events.js';
export { meterStatus } from './meters.js';
export type * from './types.js';

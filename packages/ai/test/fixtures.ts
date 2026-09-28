import { analyze, type Finding } from '@aiem/engine';
import { loadEvents, loadReadings } from '../../engine/test/dataset.js';

/** Hallazgos reales del motor sobre el dataset entregado, indexados por medidor. */
const result = analyze(loadReadings(), loadEvents());

export const findings = result.findings;

export function findingOf(meterId: string): Finding {
  const finding = findings.find((f) => f.meterId === meterId);
  if (!finding) throw new Error(`Sin hallazgo para ${meterId}`);
  return finding;
}

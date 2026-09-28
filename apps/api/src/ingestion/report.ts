import type { IngestionReport } from './ingest.js';

/** Resumen legible del informe de carga, para logs y consola. */
export function formatIngestionReport(report: IngestionReport): string {
  const { meters, readings, events, period, rejections } = report;
  const lines = [
    `Medidores: ${meters.total} (${meters.inserted} nuevos)`,
    `Lecturas:  ${readings.total} leídas · ${readings.inserted} insertadas · ` +
      `${readings.duplicates} duplicadas · ${readings.rejected} rechazadas · ` +
      `${readings.missingValues} valores faltantes`,
    `Eventos:   ${events.total} leídos · ${events.inserted} insertados · ` +
      `${events.duplicates} duplicados · ${events.rejected} rechazados`,
    `Periodo:   ${period ? `${period.from} → ${period.to}` : 'sin lecturas'}`,
  ];
  if (meters.withoutMetadata.length > 0) {
    lines.push(`Sin metadatos en meters.json: ${meters.withoutMetadata.join(', ')}`);
  }
  for (const r of rejections) lines.push(`  ✗ ${r.file}:${r.line} — ${r.reason}`);
  return lines.join('\n');
}

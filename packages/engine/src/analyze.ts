import type { AnalysisStage } from '@aiem/shared';
import { computeBaseline, type Baseline } from './baseline.js';
import { classifyConsumptionIncident, classifyDataQualityIncident } from './classify.js';
import { DEFAULT_CONFIG, type EngineConfig } from './config.js';
import { electricalSignature, type ElectricalSignature } from './correlation.js';
import { detectConsumptionIncidents, type ConsumptionIncident } from './detection/consumption.js';
import { detectDataQualityIncidents, type DataQualityIncident } from './detection/dataQuality.js';
import { assessConsumptionEvents, assessDataQualityEvents } from './events.js';
import { summarizeMeter } from './meters.js';
import { buildSeries, type MeterSeries } from './series.js';
import { mean, minMax, round, sum } from './stats.js';
import type { AnalysisResult, EventInput, Finding, ReadingInput } from './types.js';

/** Etapas que resuelve el motor; EXPLANATION y RECOMMENDATION son de la capa de IA. */
export type EngineStage = Extract<
  AnalysisStage,
  'READINGS' | 'BASELINE' | 'DETECTION' | 'CORRELATION' | 'EVENTS'
>;

export interface AnalyzeOptions {
  config?: EngineConfig;
  /** Se llama al terminar cada etapa, con un resumen legible para mostrar el progreso. */
  onStage?: (stage: EngineStage, summary: string) => void;
}

interface MeterWork {
  series: MeterSeries;
  baseline: Baseline;
  consumption: { incident: ConsumptionIncident; electrical?: ElectricalSignature }[];
  dataQuality: DataQualityIncident[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Análisis completo: lecturas → baseline → detección → correlación → eventos.
 * Función pura: no toca la red ni la base de datos, y el mismo input produce el mismo resultado.
 */
export function analyze(
  readings: ReadingInput[],
  events: EventInput[],
  options: AnalyzeOptions = {},
): AnalysisResult {
  const config = options.config ?? DEFAULT_CONFIG;
  const report = options.onStage ?? (() => {});

  // 1. Lecturas
  const allSeries = buildSeries(readings);
  const readingsAnalyzed = sum(allSeries.map((s) => s.points.length));
  report(
    'READINGS',
    `${readingsAnalyzed} lecturas de ${plural(allSeries.length, 'medidor', 'medidores')}.`,
  );

  // 2. Baseline
  const work: MeterWork[] = allSeries.map((series) => ({
    series,
    baseline: computeBaseline(series),
    consumption: [],
    dataQuality: [],
  }));
  report(
    'BASELINE',
    `Perfil horario de referencia calculado para ${plural(work.length, 'medidor', 'medidores')}.`,
  );

  // 3. Detección
  for (const w of work) {
    w.consumption = detectConsumptionIncidents(w.series, w.baseline, config).map((incident) => ({
      incident,
    }));
    w.dataQuality = detectDataQualityIncidents(w.series, w.baseline, config);
  }
  const consumptionCount = sum(work.map((w) => w.consumption.length));
  const dataQualityCount = sum(work.map((w) => w.dataQuality.length));
  report(
    'DETECTION',
    `${plural(consumptionCount, 'incidente', 'incidentes')} de consumo y ` +
      `${plural(dataQualityCount, 'problema', 'problemas')} de calidad de datos.`,
  );

  // 4. Correlación entre variables
  let withElectricalChanges = 0;
  for (const w of work) {
    for (const c of w.consumption) {
      c.electrical = electricalSignature(c.incident.points, w.baseline, config);
      if (c.electrical.signals.length > 0) withElectricalChanges++;
    }
  }
  report(
    'CORRELATION',
    `Firma eléctrica evaluada en ${plural(consumptionCount, 'incidente', 'incidentes')}: ` +
      `${withElectricalChanges} con cambios en PF, voltaje o relación física.`,
  );

  // 5. Eventos y clasificación
  const eventsByMeter = new Map<string, EventInput[]>();
  for (const e of events)
    eventsByMeter.set(e.meterId, [...(eventsByMeter.get(e.meterId) ?? []), e]);

  const findingsByMeter = new Map<string, Finding[]>();
  for (const w of work) {
    const meterEvents = eventsByMeter.get(w.series.meterId) ?? [];
    findingsByMeter.set(w.series.meterId, [
      ...w.consumption.map(({ incident, electrical }) =>
        classifyConsumptionIncident(
          incident,
          electrical!,
          assessConsumptionEvents(incident, meterEvents, config),
          w.baseline,
          config,
        ),
      ),
      ...w.dataQuality.map((incident) =>
        classifyDataQualityIncident(
          incident,
          assessDataQualityEvents(incident, meterEvents, config),
          config,
        ),
      ),
    ]);
  }

  const findings = [...findingsByMeter.values()]
    .flat()
    .map((f) => ({ ...f, priorityScore: f.evidence.priority.total }))
    .sort(
      (a, b) =>
        b.priorityScore - a.priorityScore ||
        // Empate en el borde entre dos rangos: gana el rango superior.
        b.evidence.priority.band.min - a.evidence.priority.band.min ||
        a.meterId.localeCompare(b.meterId),
    );

  const explained = findings.filter((f) =>
    f.evidence.events.some((e) => e.role === 'EXPLAINS'),
  ).length;
  report(
    'EVENTS',
    `${plural(events.length, 'evento revisado', 'eventos revisados')}: ` +
      `${plural(explained, 'hallazgo explicado', 'hallazgos explicados')} por un evento operativo.`,
  );

  const meters = work.map((w) =>
    summarizeMeter(w.series, w.baseline, findingsByMeter.get(w.series.meterId) ?? [], config),
  );
  const period = minMax(allSeries.flatMap((s) => s.points.map((p) => p.t)));
  const avgConfidence = mean(findings.map((f) => f.confidence));

  return {
    findings,
    meters,
    summary: {
      metersAnalyzed: allSeries.length,
      readingsAnalyzed,
      periodStart: period ? new Date(period.min).toISOString() : null,
      periodEnd: period ? new Date(period.max).toISOString() : null,
      totalConsumptionKwh: round(sum(meters.map((m) => m.periodConsumptionKwh)), 1),
      anomaliesDetected: findings.length,
      highPriority: findings.filter((f) => f.severity === 'HIGH').length,
      averageConfidence: avgConfidence === null ? null : round(avgConfidence, 2),
    },
  };
}

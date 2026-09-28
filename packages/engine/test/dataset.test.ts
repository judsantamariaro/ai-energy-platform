import { describe, expect, it } from 'vitest';
import { analyze, DEFAULT_CONFIG, type AnalysisResult, type EngineConfig } from '../src/index.js';
import { loadEvents, loadReadings } from './dataset.js';

const readings = loadReadings();
const events = loadEvents();
const result = analyze(readings, events);

const HEALTHY = ['M-101', 'M-102', 'M-103', 'M-105', 'M-107', 'M-108', 'M-110', 'M-111'];

const findingOf = (r: AnalysisResult, meterId: string) => {
  const found = r.findings.filter((f) => f.meterId === meterId);
  expect(found, `hallazgos de ${meterId}`).toHaveLength(1);
  return found[0]!;
};
const meterOf = (r: AnalysisResult, meterId: string) =>
  r.meters.find((m) => m.meterId === meterId)!;

/** Lo que pide el enunciado para cada caso, en la forma "TIPO/SEVERIDAD". */
const EXPECTED_CASES = {
  'M-109': 'REAL_ANOMALY/HIGH',
  'M-112': 'DATA_QUALITY/HIGH',
  'M-104': 'EXPLAINABLE_ANOMALY/MEDIUM',
  'M-106': 'FALSE_POSITIVE/LOW',
};
const cases = (r: AnalysisResult) =>
  Object.fromEntries(r.findings.map((f) => [f.meterId, `${f.type}/${f.severity}`]));

describe('dataset entregado', () => {
  it('encuentra exactamente los 4 casos, en el orden de prioridad esperado', () => {
    expect(cases(result)).toEqual(EXPECTED_CASES);
    expect(result.findings.map((f) => f.meterId)).toEqual(['M-109', 'M-112', 'M-104', 'M-106']);
    expect(result.summary).toMatchObject({
      metersAnalyzed: 12,
      readingsAnalyzed: 4032,
      anomaliesDetected: 4,
      highPriority: 2,
    });
  });

  it('no genera hallazgos en los 8 medidores sanos', () => {
    for (const meterId of HEALTHY) {
      expect(result.findings.filter((f) => f.meterId === meterId)).toEqual([]);
      expect(meterOf(result, meterId).status).toBe('OK');
    }
  });

  it('M-109: aumento sin causa, con cambios eléctricos; el evento UNKNOWN no lo explica', () => {
    const f = findingOf(result, 'M-109');
    expect(f.windowStart).toBe('2026-09-12T14:00:00.000Z');
    expect(f.evidence.window.ongoing).toBe(true);
    expect(f.evidence.consumption!.meanDeviation).toBeGreaterThan(1);
    expect(f.evidence.signals).toEqual([
      'CONSUMPTION_INCREASE',
      'POWER_FACTOR_DEGRADATION',
      'VOLTAGE_SHIFT',
      'PHYSICAL_RATIO_SHIFT',
    ]);
    expect(f.evidence.events).toMatchObject([{ type: 'UNKNOWN', role: 'NOT_EXPLANATORY' }]);
    expect(f.confidence).toBeGreaterThanOrEqual(0.9);
    expect(meterOf(result, 'M-109').status).toBe('CRITICAL');
  });

  it('M-112: consumo estable con variables eléctricas inconsistentes', () => {
    const f = findingOf(result, 'M-112');
    expect(f.evidence.signals).toEqual([
      'VOLTAGE_OUT_OF_BAND',
      'VOLTAGE_JUMPS',
      'PHYSICAL_RATIO_DISPERSION',
    ]);
    expect(Math.abs(f.evidence.dataQuality!.consumptionMeanDeviation!)).toBeLessThan(0.05);
    expect(f.evidence.events).toMatchObject([{ type: 'DATA_QUALITY', role: 'CORROBORATES' }]);
    expect(meterOf(result, 'M-112').status).toBe('ALERT');
  });

  it('M-104: aumento explicado por el cambio operativo registrado', () => {
    const f = findingOf(result, 'M-104');
    expect(f.windowStart).toBe('2026-09-11T00:00:00.000Z');
    expect(f.evidence.signals).toEqual(['CONSUMPTION_INCREASE']);
    expect(f.evidence.events).toMatchObject([
      { type: 'OPERATIONAL_CHANGE', role: 'EXPLAINS', offsetHours: 0 },
    ]);
    expect(meterOf(result, 'M-104').status).toBe('ALERT');
  });

  it('M-106: caída de 12 h explicada por la parada programada, que declara 12 h', () => {
    const f = findingOf(result, 'M-106');
    expect(f.evidence.window).toEqual({
      start: '2026-09-08T00:00:00.000Z',
      end: '2026-09-08T11:00:00.000Z',
      durationHours: 12,
      ongoing: false,
    });
    expect(f.evidence.events).toMatchObject([
      {
        type: 'SCHEDULED_OUTAGE',
        role: 'EXPLAINS',
        declaredDurationHours: 12,
        durationMatches: true,
      },
    ]);
    expect(meterOf(result, 'M-106').status).toBe('OK');
  });

  it('calcula el consumo actual (últimas 24 h) frente al baseline', () => {
    expect(meterOf(result, 'M-109').current!.variation).toBeGreaterThan(1);
    expect(meterOf(result, 'M-104').current!.variation).toBeGreaterThan(0.4);
    expect(Math.abs(meterOf(result, 'M-112').current!.variation)).toBeLessThan(0.05);
    for (const meterId of HEALTHY) {
      expect(Math.abs(meterOf(result, meterId).current!.variation)).toBeLessThan(0.05);
    }
  });

  it('la evidencia explica la prioridad y la confianza', () => {
    for (const f of result.findings) {
      expect(f.priorityScore).toBe(f.evidence.priority.total);
      expect(f.evidence.confidenceFactors.length).toBeGreaterThan(0);
      expect(f.confidence).toBeGreaterThanOrEqual(0.5);
      expect(f.confidence).toBeLessThanOrEqual(0.99);
    }
  });
});

describe('sensibilidad de los umbrales', () => {
  type Path = [keyof EngineConfig, string];
  const THRESHOLDS: Path[] = [
    ['consumption', 'deviationThreshold'],
    ['electrical', 'powerFactorDrop'],
    ['electrical', 'voltageShift'],
    ['electrical', 'physicalRatioShift'],
    ['dataQuality', 'voltageBand'],
    ['dataQuality', 'voltageJumpV'],
    ['dataQuality', 'ratioOutlier'],
    ['dataQuality', 'dispersionRatio'],
    ['events', 'toleranceHours'],
    ['severity', 'realHighDeviation'],
  ];

  const withScaled = ([section, key]: Path, factor: number): EngineConfig => {
    const values = DEFAULT_CONFIG[section] as Record<string, number>;
    return { ...DEFAULT_CONFIG, [section]: { ...values, [key]: values[key]! * factor } };
  };

  it.each(
    THRESHOLDS.flatMap((path) =>
      [0.8, 1.2].map((factor) => [path.join('.'), factor, path] as const),
    ),
  )('%s × %s no cambia el resultado', (_, factor, path) => {
    const r = analyze(readings, events, { config: withScaled(path, factor) });
    expect(cases(r)).toEqual(EXPECTED_CASES);
  });
});

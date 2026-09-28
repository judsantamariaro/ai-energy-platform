import { describe, expect, it } from 'vitest';
import { analyze, type EngineStage } from '../src/index.js';
import type { ReadingInput } from '../src/types.js';
import { event, scaleLoadFrom, syntheticMeter } from './synthetic.js';

const DAY = 24;
const STEP = 10 * DAY; // el cambio empieza el día 11

const only = (readings: ReadingInput[], events = [] as ReturnType<typeof event>[]) => {
  const result = analyze(readings, events);
  expect(result.findings).toHaveLength(1);
  return result.findings[0]!;
};

describe('medidores sanos', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('semilla %i: sin hallazgos y en estado OK', (seed) => {
    const result = analyze(syntheticMeter({ seed }), []);
    expect(result.findings).toEqual([]);
    expect(result.meters[0]!.status).toBe('OK');
  });

  it('tolera valores faltantes y horas sin lecturas', () => {
    const readings = syntheticMeter({
      transform: (r, i) => (i % 17 === 0 ? { ...r, voltageV: null, powerFactor: null } : r),
    }).filter((_, i) => i < 100 || i > 110);

    const result = analyze(readings, []);
    expect(result.findings).toEqual([]);
  });

  it('una lectura de voltaje aislada fuera de rango no es un problema de calidad de datos', () => {
    const readings = syntheticMeter({
      transform: (r, i) => (i === 200 ? { ...r, voltageV: 250 } : r),
    });
    expect(analyze(readings, []).findings).toEqual([]);
  });
});

describe('incidentes de consumo', () => {
  it('aumento grande sin evento → anomalía real HIGH, activa y de estado CRITICAL', () => {
    const readings = syntheticMeter({ transform: scaleLoadFrom(STEP, 1.8) });
    const result = analyze(readings, []);

    expect(result.findings).toMatchObject([
      { type: 'REAL_ANOMALY', severity: 'HIGH', windowStart: readings[STEP]!.timestamp },
    ]);
    expect(result.findings[0]!.evidence.window.ongoing).toBe(true);
    expect(result.meters[0]!.status).toBe('CRITICAL');
  });

  it('aumento moderado sin evento ni cambios eléctricos → anomalía real MEDIUM (ALERT)', () => {
    const result = analyze(syntheticMeter({ transform: scaleLoadFrom(STEP, 1.35) }), []);
    expect(result.findings).toMatchObject([{ type: 'REAL_ANOMALY', severity: 'MEDIUM' }]);
    expect(result.meters[0]!.status).toBe('ALERT');
  });

  it('aumento moderado con caída del factor de potencia → HIGH por el cambio eléctrico', () => {
    const readings = syntheticMeter({
      transform: (r, i) => {
        const scaled = scaleLoadFrom(STEP, 1.35)(r, i);
        return i >= STEP ? { ...scaled, powerFactor: 0.78 } : scaled;
      },
    });
    const f = only(readings);
    expect(f).toMatchObject({ type: 'REAL_ANOMALY', severity: 'HIGH' });
    expect(f.evidence.signals).toContain('POWER_FACTOR_DEGRADATION');
  });

  it('aumento con un cambio operativo al inicio → anomalía explicable MEDIUM', () => {
    const f = only(syntheticMeter({ transform: scaleLoadFrom(STEP, 1.5) }), [
      event(STEP, 'OPERATIONAL_CHANGE', 'Nueva línea de producción'),
    ]);
    expect(f).toMatchObject({ type: 'EXPLAINABLE_ANOMALY', severity: 'MEDIUM' });
  });

  it('un evento a más de 2 h del inicio no se considera', () => {
    const f = only(syntheticMeter({ transform: scaleLoadFrom(STEP, 1.5) }), [
      event(STEP - 5, 'OPERATIONAL_CHANGE'),
    ]);
    expect(f.type).toBe('REAL_ANOMALY');
    expect(f.evidence.events).toEqual([]);
  });

  it('un evento UNKNOWN no explica el cambio: queda como contexto', () => {
    const f = only(syntheticMeter({ transform: scaleLoadFrom(STEP, 1.8) }), [
      event(STEP, 'UNKNOWN', 'No operational event reported'),
    ]);
    expect(f.type).toBe('REAL_ANOMALY');
    expect(f.evidence.events).toMatchObject([{ role: 'NOT_EXPLANATORY' }]);
  });

  it('caída con parada programada y recuperación → falso positivo LOW; el medidor queda OK', () => {
    const result = analyze(syntheticMeter({ transform: scaleLoadFrom(STEP, 0.2, STEP + 10) }), [
      event(STEP, 'SCHEDULED_OUTAGE', 'Maintenance outage for 10 hours'),
    ]);
    expect(result.findings).toMatchObject([{ type: 'FALSE_POSITIVE', severity: 'LOW' }]);
    expect(result.findings[0]!.evidence.events).toMatchObject([
      { role: 'EXPLAINS', declaredDurationHours: 10, durationMatches: true },
    ]);
    expect(result.meters[0]!.status).toBe('OK');
  });

  it('parada programada pero el consumo nunca se recupera → anomalía real', () => {
    const f = only(syntheticMeter({ transform: scaleLoadFrom(STEP, 0.2) }), [
      event(STEP, 'SCHEDULED_OUTAGE', 'Maintenance outage for 10 hours'),
    ]);
    expect(f.type).toBe('REAL_ANOMALY');
    expect(f.evidence.events).toMatchObject([{ role: 'NOT_EXPLANATORY' }]);
  });

  it('una parada programada no explica un aumento', () => {
    const f = only(syntheticMeter({ transform: scaleLoadFrom(STEP, 1.8) }), [
      event(STEP, 'SCHEDULED_OUTAGE'),
    ]);
    expect(f.type).toBe('REAL_ANOMALY');
  });
});

describe('calidad de datos', () => {
  // Cada 3 h, voltaje y PF saltan a valores repetidos mientras el consumo sigue normal.
  const corrupted = syntheticMeter({
    transform: (r, i) =>
      i >= 12 * DAY && i % 3 === 0
        ? { ...r, voltageV: i % 2 === 0 ? 241 : 202, powerFactor: i % 2 === 0 ? 0.98 : 0.58 }
        : r,
  });

  it('variables eléctricas inconsistentes con consumo estable → DATA_QUALITY HIGH', () => {
    const f = only(corrupted);
    expect(f).toMatchObject({ type: 'DATA_QUALITY', severity: 'HIGH' });
    expect(f.evidence.signals).toEqual(
      expect.arrayContaining(['VOLTAGE_OUT_OF_BAND', 'VOLTAGE_JUMPS']),
    );
    expect(f.evidence.confidenceFactors.find((c) => c.name.startsWith('Evento'))!.score).toBe(0.6);
  });

  it('un evento DATA_QUALITY en la ventana corrobora el hallazgo y sube la confianza', () => {
    const withEvent = only(corrupted, [event(12 * DAY, 'DATA_QUALITY', 'Lecturas intermitentes')]);
    expect(withEvent.evidence.events).toMatchObject([{ role: 'CORROBORATES' }]);
    expect(withEvent.confidence).toBeGreaterThan(only(corrupted).confidence);
  });
});

describe('priorización y etapas', () => {
  it('ordena: anomalía real > calidad de datos > explicable > falso positivo', () => {
    const readings = [
      ...syntheticMeter({ meterId: 'A', seed: 1, transform: scaleLoadFrom(STEP, 0.2, STEP + 10) }),
      ...syntheticMeter({ meterId: 'B', seed: 2, transform: scaleLoadFrom(STEP, 1.5) }),
      ...syntheticMeter({ meterId: 'C', seed: 3, transform: scaleLoadFrom(STEP, 1.9) }),
      ...syntheticMeter({
        meterId: 'D',
        seed: 4,
        transform: (r, i) =>
          i >= 12 * DAY && i % 3 === 0
            ? { ...r, voltageV: i % 2 ? 202 : 241, powerFactor: 0.58 }
            : r,
      }),
    ];
    const events = [
      event(STEP, 'SCHEDULED_OUTAGE', 'outage for 10 hours', 'A'),
      event(STEP, 'OPERATIONAL_CHANGE', 'new line', 'B'),
    ];

    const result = analyze(readings, events);
    expect(result.findings.map((f) => `${f.meterId}:${f.type}`)).toEqual([
      'C:REAL_ANOMALY',
      'D:DATA_QUALITY',
      'B:EXPLAINABLE_ANOMALY',
      'A:FALSE_POSITIVE',
    ]);
  });

  it('informa las etapas en orden, con un resumen de cada una', () => {
    const stages: EngineStage[] = [];
    analyze(syntheticMeter(), [], {
      onStage: (stage, summary) => {
        expect(summary.length).toBeGreaterThan(0);
        stages.push(stage);
      },
    });
    expect(stages).toEqual(['READINGS', 'BASELINE', 'DETECTION', 'CORRELATION', 'EVENTS']);
  });

  it('sin lecturas devuelve un resultado vacío', () => {
    expect(analyze([], []).summary).toMatchObject({ metersAnalyzed: 0, anomaliesDetected: 0 });
  });
});

describe('parada programada que no dura lo declarado', () => {
  it('una caída más larga que la parada declarada queda como explicable, no se descarta', () => {
    // La parada declara 10 h, pero el consumo tarda 30 h en recuperarse.
    const f = only(syntheticMeter({ transform: scaleLoadFrom(STEP, 0.2, STEP + 30) }), [
      event(STEP, 'SCHEDULED_OUTAGE', 'Maintenance outage for 10 hours'),
    ]);
    expect(f).toMatchObject({ type: 'EXPLAINABLE_ANOMALY', severity: 'MEDIUM' });
    expect(f.evidence.events).toMatchObject([
      { role: 'EXPLAINS', declaredDurationHours: 10, durationMatches: false },
    ]);
    expect(f.evidence.events[0]!.note).toContain('declara 10 h y la caída duró 30 h');
  });

  it('sin duración declarada, una caída con recuperación sigue siendo falso positivo', () => {
    const f = only(syntheticMeter({ transform: scaleLoadFrom(STEP, 0.2, STEP + 30) }), [
      event(STEP, 'SCHEDULED_OUTAGE', 'Mantenimiento'),
    ]);
    expect(f.type).toBe('FALSE_POSITIVE');
  });
});

describe('horas sin consumo esperado', () => {
  // Una planta que no consume nada de noche (00:00–05:59).
  const nightOff = (r: ReadingInput, i: number): ReadingInput =>
    i % DAY < 6 ? { ...r, consumptionKwh: 0, currentA: 0 } : r;

  it('un medidor que apaga de noche no genera hallazgos', () => {
    expect(analyze(syntheticMeter({ transform: nightOff }), []).findings).toEqual([]);
  });

  it('consumo nocturno donde se esperaba cero → anomalía real', () => {
    // El día 12 un equipo queda encendido toda la noche.
    const readings = syntheticMeter({
      transform: (r, i) => {
        const off = nightOff(r, i);
        return i >= 11 * DAY && i < 11 * DAY + 6
          ? { ...off, consumptionKwh: 20, currentA: 90 }
          : off;
      },
    });
    const f = only(readings);
    expect(f).toMatchObject({ type: 'REAL_ANOMALY', windowStart: readings[11 * DAY]!.timestamp });
    expect(f.evidence.consumption).toMatchObject({ direction: 'UP', expectedKwh: 0 });
    expect(f.evidence.window.durationHours).toBe(6);
  });
});

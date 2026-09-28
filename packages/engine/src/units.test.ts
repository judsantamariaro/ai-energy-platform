import { describe, expect, it } from 'vitest';
import { parseDeclaredDurationHours } from './events.js';
import { confidence, factor, priority } from './scoring.js';
import { mad, maxByMagnitude, median, rollingMeans } from './stats.js';

describe('estadística', () => {
  it('median y mad', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(mad([1, 2, 3, 100])).toBe(1);
  });

  it('rollingMeans usa la media total si hay menos valores que la ventana', () => {
    expect(rollingMeans([1, 2, 3, 4], 2)).toEqual([1.5, 2.5, 3.5]);
    expect(rollingMeans([1, 3], 6)).toEqual([2]);
  });

  it('maxByMagnitude conserva el signo', () => {
    expect(maxByMagnitude([0.1, -0.5, 0.3])).toBe(-0.5);
  });
});

describe('parseDeclaredDurationHours', () => {
  it.each([
    ['Scheduled maintenance outage for 12 hours', 12],
    ['Parada de 8 horas', 8],
    ['Mantenimiento 1,5 h', 1.5],
    ['Shutdown for 2 days', 48],
    ['New production line activated', null],
  ])('"%s" → %s', (description, expected) => {
    expect(parseDeclaredDurationHours(description)).toBe(expected);
  });
});

describe('puntaje', () => {
  it('ubica la prioridad dentro del rango de su tipo y severidad', () => {
    expect(
      priority({ type: 'REAL_ANOMALY', severity: 'HIGH', magnitude: 1, signals: 3, ongoing: true }),
    ).toEqual({
      band: { min: 75, max: 100 },
      magnitude: 1,
      risk: 1,
      ongoing: 1,
      intensity: 1,
      total: 100,
    });
    expect(
      priority({ type: 'REAL_ANOMALY', severity: 'HIGH', magnitude: 0, signals: 0, ongoing: false })
        .total,
    ).toBe(75);
  });

  it('un falso positivo no suma riesgo ni vigencia', () => {
    const p = priority({
      type: 'FALSE_POSITIVE',
      severity: 'LOW',
      magnitude: 0.8,
      signals: 3,
      ongoing: true,
    });
    expect(p).toMatchObject({ risk: 0, ongoing: 0, intensity: 0.32, total: 6.4 });
  });

  it('una anomalía real HIGH mínima siempre supera a la calidad de datos HIGH máxima', () => {
    const weakestReal = priority({
      type: 'REAL_ANOMALY',
      severity: 'HIGH',
      magnitude: 0,
      signals: 0,
      ongoing: false,
    });
    const strongestDataQuality = priority({
      type: 'DATA_QUALITY',
      severity: 'HIGH',
      magnitude: 1,
      signals: 3,
      ongoing: true,
    });
    expect(weakestReal.total).toBeGreaterThanOrEqual(strongestDataQuality.total);
  });

  it('falla si el clasificador produce una combinación sin rango', () => {
    expect(() =>
      priority({
        type: 'FALSE_POSITIVE',
        severity: 'HIGH',
        magnitude: 1,
        signals: 0,
        ongoing: false,
      }),
    ).toThrow('Sin rango de prioridad');
  });

  it('la confianza va de 0,5 a 0,99 según el promedio ponderado de los factores', () => {
    expect(confidence([factor('a', 0, 1, '')])).toBe(0.5);
    expect(confidence([factor('a', 1, 1, '')])).toBe(0.99);
    expect(confidence([factor('a', 1, 3, ''), factor('b', 0, 1, '')])).toBe(0.87);
  });
});

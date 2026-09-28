import { describe, expect, it } from 'vitest';
import {
  confidencePct,
  dateTime,
  duration,
  energy,
  kwh,
  pct,
  shortDateTime,
  timeAgo,
} from './format';

describe('formato', () => {
  it('números y energía en español', () => {
    expect(kwh(2207.6)).toBe('2.208 kWh');
    expect(energy(155250.8)).toBe('155,3 MWh');
    expect(energy(820)).toBe('820 kWh');
  });

  it('porcentajes con signo y confianza', () => {
    expect(pct(1.0791)).toBe('+107,9 %');
    expect(pct(-0.797)).toBe('−79,7 %');
    expect(pct(0.0001)).toBe('0,0 %');
    expect(confidencePct(0.97)).toBe('97 %');
  });

  it('fechas siempre en UTC, sin importar la zona del navegador', () => {
    expect(shortDateTime('2026-09-12T14:00:00.000Z')).toBe('12/09 14:00');
    expect(dateTime('2026-09-12T14:00:00.000Z')).toBe('12 sep 2026, 14:00 UTC');
  });

  it('tiempos relativos y duraciones', () => {
    const now = Date.parse('2026-09-28T12:00:00Z');
    expect(timeAgo('2026-09-28T11:57:00Z', now)).toBe('hace 3 min');
    expect(timeAgo('2026-09-27T12:00:00Z', now)).toBe('hace 1 día');
    expect(duration('2026-09-28T12:00:00.000Z', '2026-09-28T12:00:00.020Z')).toBe('< 0,1 s');
    expect(duration('2026-09-28T12:00:00Z', '2026-09-28T12:00:19Z')).toBe('19 s');
  });
});

import type { EventInput, ReadingInput } from '../src/types.js';

/** Generador pseudoaleatorio determinista (LCG): los tests dan siempre el mismo resultado. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** Perfil diario típico: noche baja, jornada alta, tarde intermedia. */
const PROFILE = (hour: number) => (hour < 6 ? 0.65 : hour < 8 ? 0.8 : hour < 18 ? 1 : 0.83);

export const START = Date.parse('2026-09-01T00:00:00.000Z');
export const HOUR = 3_600_000;
export const iso = (hourIndex: number) => new Date(START + hourIndex * HOUR).toISOString();

export interface SyntheticOptions {
  meterId?: string;
  days?: number;
  baseKwh?: number;
  noise?: number;
  seed?: number;
  /** Modifica la lectura de la hora `index` (0 = primera hora de la serie). */
  transform?: (reading: ReadingInput, index: number) => ReadingInput;
}

/** Serie horaria de un medidor sano, físicamente coherente (kWh ≈ 1,07 · V·I·PF / 1000). */
export function syntheticMeter(options: SyntheticOptions = {}): ReadingInput[] {
  const { meterId = 'S-001', days = 14, baseKwh = 36, noise = 0.05, seed = 1, transform } = options;
  const random = rng(seed);
  const jitter = (amplitude: number) => (random() * 2 - 1) * amplitude;

  return Array.from({ length: days * 24 }, (_, index) => {
    const kwh = baseKwh * PROFILE(index % 24) * (1 + jitter(noise));
    const voltage = 220 + jitter(1.5);
    const pf = 0.94 + jitter(0.015);
    const reading: ReadingInput = {
      meterId,
      timestamp: iso(index),
      consumptionKwh: kwh,
      voltageV: voltage,
      currentA: ((kwh * 1000) / (voltage * pf * 1.07)) * (1 + jitter(0.03)),
      powerFactor: pf,
    };
    return transform ? transform(reading, index) : reading;
  });
}

/** Escala consumo y corriente a partir de una hora (cambio de carga coherente). */
export function scaleLoadFrom(fromIndex: number, factor: number, untilIndex = Infinity) {
  return (r: ReadingInput, i: number): ReadingInput =>
    i >= fromIndex && i < untilIndex
      ? { ...r, consumptionKwh: r.consumptionKwh! * factor, currentA: r.currentA! * factor }
      : r;
}

export function event(
  hourIndex: number,
  type: string,
  description = '',
  meterId = 'S-001',
): EventInput {
  return { meterId, timestamp: iso(hourIndex), type, description };
}

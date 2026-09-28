import { describe, expect, it } from 'vitest';
import { allowedNumbers, extractNumbers, ungroundedNumbers } from '../src/grounding.js';

describe('extractNumbers', () => {
  it('entiende el formato español y el inglés', () => {
    expect(extractNumbers('Subió +107,9 % (5.380,9 kWh; PF 0.74) en 58 h')).toEqual([
      107.9, 5380.9, 0.74, 58,
    ]);
  });
});

describe('ungroundedNumbers', () => {
  const evidence = {
    meanDeviation: 1.0791,
    powerFactor: 0.7401,
    observedKwh: 5380.94,
    start: '2026-09-12T14:00:00.000Z',
  };
  const allowed = allowedNumbers(evidence);

  it('acepta los números de la evidencia redondeados o en porcentaje', () => {
    const text =
      'Desde el 12/09 a las 14:00 el consumo subió 107,9 % (108 %), 5.380,9 kWh, PF 0,74.';
    expect(ungroundedNumbers(text, allowed)).toEqual([]);
  });

  it('no confunde un decimal en inglés con miles ("0.740" no es 740)', () => {
    expect(ungroundedNumbers('El factor de potencia cayó a 0.740.', allowed)).toEqual([]);
  });

  it('acepta un número ambiguo si alguna de sus lecturas está en la evidencia', () => {
    // "1.079" puede ser 1079 (miles) o 1,079 (decimal); la evidencia tiene 1,0791.
    expect(ungroundedNumbers('La desviación fue de 1.079.', allowed)).toEqual([]);
  });

  it('acepta enteros pequeños que no son datos ("3 pasos")', () => {
    expect(ungroundedNumbers('Sigue estos 3 pasos.', allowed)).toEqual([]);
  });

  it('detecta cifras inventadas', () => {
    expect(ungroundedNumbers('El consumo subió 250 % y el PF llegó a 0,52.', allowed)).toEqual([
      250, 0.52,
    ]);
  });
});

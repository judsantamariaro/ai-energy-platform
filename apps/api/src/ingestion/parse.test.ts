import { describe, expect, it } from 'vitest';
import { CsvFormatError, parseEventsCsv, parseReadingsCsv } from './parse.js';

const HEADER = 'meter_id,timestamp,consumption_kwh,voltage_v,current_a,power_factor,status';

describe('parseReadingsCsv', () => {
  it('convierte una fila válida', () => {
    const { rows, rejections } = parseReadingsCsv(
      `${HEADER}\nM-101,2026-09-01 00:00:00,23.5,221.9,101.28,0.954,OK`,
    );
    expect(rejections).toEqual([]);
    expect(rows).toEqual([
      {
        meterId: 'M-101',
        timestamp: '2026-09-01T00:00:00.000Z',
        consumptionKwh: 23.5,
        voltageV: 221.9,
        currentA: 101.28,
        powerFactor: 0.954,
        status: 'OK',
      },
    ]);
  });

  it('conserva lecturas físicamente anómalas: detectarlas es trabajo del motor', () => {
    const { rows, rejections } = parseReadingsCsv(
      [
        HEADER,
        'M-112,2026-09-13 06:00:00,25.95,202.75,52.27,0.58,OK', // voltaje -8 %, PF bajo
        'M-112,2026-09-13 07:00:00,-3,400,0,1.2,OK', // imposible, pero interpretable
      ].join('\n'),
    );
    expect(rejections).toEqual([]);
    expect(rows.map((r) => r.voltageV)).toEqual([202.75, 400]);
  });

  it('guarda un valor vacío como dato faltante (null) sin descartar la lectura', () => {
    const { rows } = parseReadingsCsv(`${HEADER}\nM-101,2026-09-01 00:00:00,23.5,,101.28,0.954,OK`);
    expect(rows[0]?.voltageV).toBeNull();
  });

  it('rechaza lo que no se puede interpretar e indica la línea', () => {
    const { rows, rejections, total } = parseReadingsCsv(
      [
        HEADER,
        'M-101,2026-09-01 00:00:00,23.5,221.9,101.28,0.954,OK',
        'M-101,2026-09-01 01:00:00,abc,221.9,101.28,0.954,OK',
        'M-101,no-es-fecha,23.5,221.9,101.28,0.954,OK',
        ',2026-09-01 02:00:00,23.5,221.9,101.28,0.954,OK',
      ].join('\n'),
    );
    expect(total).toBe(4);
    expect(rows).toHaveLength(1);
    expect(rejections).toEqual([
      { line: 3, reason: 'valor no numérico en consumption_kwh: "abc"' },
      { line: 4, reason: 'timestamp inválido: "no-es-fecha"' },
      { line: 5, reason: 'falta meter_id' },
    ]);
  });

  it('cuenta los duplicados (medidor + timestamp) y conserva el primero', () => {
    const { rows, duplicates } = parseReadingsCsv(
      [
        HEADER,
        'M-101,2026-09-01 00:00:00,23.5,221.9,101.28,0.954,OK',
        'M-101,2026-09-01 00:00:00,99,221.9,101.28,0.954,OK',
      ].join('\n'),
    );
    expect(duplicates).toBe(1);
    expect(rows[0]?.consumptionKwh).toBe(23.5);
  });

  it('falla si falta una columna obligatoria', () => {
    expect(() => parseReadingsCsv('meter_id,timestamp\nM-101,2026-09-01 00:00:00')).toThrow(
      CsvFormatError,
    );
  });
});

describe('parseEventsCsv', () => {
  it('normaliza el tipo de evento y acepta tipos desconocidos', () => {
    const { rows } = parseEventsCsv(
      'meter_id,event_timestamp,event_type,description\n' +
        'M-109,2026-09-12 14:00,unknown,No operational event reported\n' +
        'M-200,2026-09-12 15:00,CUSTOM_TYPE,',
    );
    expect(rows).toEqual([
      {
        meterId: 'M-109',
        timestamp: '2026-09-12T14:00:00.000Z',
        type: 'UNKNOWN',
        description: 'No operational event reported',
      },
      {
        meterId: 'M-200',
        timestamp: '2026-09-12T15:00:00.000Z',
        type: 'CUSTOM_TYPE',
        description: '',
      },
    ]);
  });
});

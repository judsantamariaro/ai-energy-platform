import { readFileSync } from 'node:fs';
import type { EventInput, ReadingInput } from '../src/types.js';

/**
 * Carga los datasets entregados (data/*.csv) para los tests. Es un lector mínimo: el motor no
 * parsea CSV, y la carga robusta con validación vive en la API.
 */
const DATA_DIR = new URL('../../../data/', import.meta.url);

const toIso = (raw: string) => `${raw.trim().replace(' ', 'T').slice(0, 16)}:00.000Z`;
const num = (raw: string | undefined) => (raw === undefined || raw === '' ? null : Number(raw));

function rows(file: string): string[][] {
  return readFileSync(new URL(file, DATA_DIR), 'utf8')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(','));
}

export function loadReadings(): ReadingInput[] {
  return rows('readings.csv').map(([meterId, ts, kwh, v, i, pf]) => ({
    meterId: meterId!,
    timestamp: toIso(ts!),
    consumptionKwh: num(kwh),
    voltageV: num(v),
    currentA: num(i),
    powerFactor: num(pf),
  }));
}

export function loadEvents(): EventInput[] {
  return rows('events.csv').map(([meterId, ts, type, ...description], index) => ({
    id: index + 1,
    meterId: meterId!,
    timestamp: toIso(ts!),
    type: type!,
    description: description.join(','),
  }));
}

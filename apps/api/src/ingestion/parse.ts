import { parse } from 'csv-parse/sync';
import { parseCsvTimestamp } from './timestamps.js';

/**
 * Validación ESTRUCTURAL de los CSV.
 *
 * Solo se descarta lo que no se puede interpretar (fecha ilegible, texto en un campo numérico,
 * falta el medidor). Los valores físicamente raros (202 V, PF > 1, consumo negativo) se guardan
 * tal cual: detectarlos es trabajo del motor analítico y son justamente la señal de calidad de datos.
 */

export class CsvFormatError extends Error {}

export interface Rejection {
  line: number;
  reason: string;
}

export interface ParsedCsv<T> {
  rows: T[];
  /** Filas de datos leídas (sin contar el encabezado). */
  total: number;
  rejections: Rejection[];
  /** Filas repetidas por clave natural; se conserva la primera. */
  duplicates: number;
}

export interface ReadingRow {
  meterId: string;
  timestamp: string;
  consumptionKwh: number | null;
  voltageV: number | null;
  currentA: number | null;
  powerFactor: number | null;
  status: string | null;
}

export interface EventRow {
  meterId: string;
  timestamp: string;
  type: string;
  description: string;
}

interface CsvRecord {
  line: number;
  get: (column: string) => string;
}

function readCsv(content: string, requiredColumns: readonly string[]): CsvRecord[] {
  const [header, ...records] = parse(content, {
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];

  if (!header) throw new CsvFormatError('El archivo está vacío');
  const missing = requiredColumns.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new CsvFormatError(`Faltan columnas obligatorias: ${missing.join(', ')}`);
  }

  const index = new Map(header.map((column, i) => [column, i]));
  return records.map((values, i) => ({
    // Línea 1 = encabezado. Asume registros de una sola línea, como en los datasets entregados.
    line: i + 2,
    get: (column) => values[index.get(column) ?? -1] ?? '',
  }));
}

/** Vacío → `null` (dato faltante). Texto no numérico → error. */
function parseMeasure(raw: string, column: string): number | null {
  if (raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`valor no numérico en ${column}: "${raw}"`);
  return value;
}

function collect<T>(
  records: CsvRecord[],
  toRow: (record: CsvRecord) => T,
  key: (row: T) => string,
): ParsedCsv<T> {
  const rows: T[] = [];
  const rejections: Rejection[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  for (const record of records) {
    let row: T;
    try {
      row = toRow(record);
    } catch (err) {
      rejections.push({ line: record.line, reason: (err as Error).message });
      continue;
    }
    const k = key(row);
    if (seen.has(k)) {
      duplicates++;
      continue;
    }
    seen.add(k);
    rows.push(row);
  }

  return { rows, total: records.length, rejections, duplicates };
}

function requireMeterAndTimestamp(record: CsvRecord, timestampColumn: string) {
  const meterId = record.get('meter_id');
  if (meterId === '') throw new Error('falta meter_id');
  const rawTimestamp = record.get(timestampColumn);
  const timestamp = parseCsvTimestamp(rawTimestamp);
  if (!timestamp) throw new Error(`timestamp inválido: "${rawTimestamp}"`);
  return { meterId, timestamp };
}

const READING_MEASURES = [
  ['consumption_kwh', 'consumptionKwh'],
  ['voltage_v', 'voltageV'],
  ['current_a', 'currentA'],
  ['power_factor', 'powerFactor'],
] as const;

export function parseReadingsCsv(content: string): ParsedCsv<ReadingRow> {
  const records = readCsv(content, ['meter_id', 'timestamp', ...READING_MEASURES.map(([c]) => c)]);

  return collect(
    records,
    (record) => {
      const row: ReadingRow = {
        ...requireMeterAndTimestamp(record, 'timestamp'),
        consumptionKwh: null,
        voltageV: null,
        currentA: null,
        powerFactor: null,
        status: record.get('status') || null,
      };
      for (const [column, field] of READING_MEASURES) {
        row[field] = parseMeasure(record.get(column), column);
      }
      return row;
    },
    (row) => `${row.meterId}|${row.timestamp}`,
  );
}

export function parseEventsCsv(content: string): ParsedCsv<EventRow> {
  const records = readCsv(content, ['meter_id', 'event_timestamp', 'event_type']);

  return collect(
    records,
    (record) => {
      const type = record.get('event_type').toUpperCase();
      if (type === '') throw new Error('falta event_type');
      return {
        ...requireMeterAndTimestamp(record, 'event_timestamp'),
        type,
        description: record.get('description'),
      };
    },
    (row) => `${row.meterId}|${row.timestamp}|${row.type}`,
  );
}

/** Cuenta mediciones vacías (datos faltantes) en las lecturas aceptadas. */
export function countMissingValues(rows: ReadingRow[]): number {
  return rows.reduce(
    (sum, row) => sum + READING_MEASURES.filter(([, field]) => row[field] === null).length,
    0,
  );
}

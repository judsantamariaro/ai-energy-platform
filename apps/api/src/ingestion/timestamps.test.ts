import { describe, expect, it } from 'vitest';
import { parseCsvTimestamp } from './timestamps.js';

describe('parseCsvTimestamp', () => {
  it('interpreta el formato de readings.csv como UTC', () => {
    expect(parseCsvTimestamp('2026-09-01 00:00:00')).toBe('2026-09-01T00:00:00.000Z');
  });

  it('acepta el formato de events.csv, sin segundos', () => {
    expect(parseCsvTimestamp('2026-09-12 14:00')).toBe('2026-09-12T14:00:00.000Z');
  });

  it.each(['', 'ayer', '2026-09-01', '2026-02-30 00:00', '2026-09-01 24:00', '01/09/2026 00:00'])(
    'rechaza "%s"',
    (raw) => {
      expect(parseCsvTimestamp(raw)).toBeNull();
    },
  );
});

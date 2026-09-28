const CSV_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Interpreta un timestamp del CSV (`2026-09-01 00:00:00` o `2026-09-11 00:00`, sin zona) como UTC.
 * Devuelve ISO 8601 (`2026-09-01T00:00:00.000Z`) o `null` si el texto no es una fecha válida.
 */
export function parseCsvTimestamp(raw: string): string | null {
  const match = CSV_TIMESTAMP.exec(raw.trim());
  if (!match) return null;

  const [y, mo, d, h, mi, s] = match.slice(1).map((part) => Number(part ?? 0));
  const date = new Date(Date.UTC(y!, mo! - 1, d!, h!, mi!, s!));

  // Date "corrige" fechas imposibles (2026-02-30 → 2026-03-02); en ese caso la rechazamos.
  const roundTrip = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ];
  if (roundTrip.some((value, i) => value !== [y, mo, d, h, mi, s][i])) return null;

  return date.toISOString();
}

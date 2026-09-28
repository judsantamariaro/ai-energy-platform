/**
 * Control contra alucinaciones (F3-c): todo número que cite el LLM tiene que salir de la evidencia.
 *
 * Se aceptan las formas en que un número aparece en un texto: redondeado a 0–3 decimales, como
 * porcentaje (0,2722 → 27,2), en valor absoluto, y las partes de las fechas (día, mes, hora).
 * También los números del texto de referencia (plantilla) y los enteros pequeños ("3 pasos").
 */

const NUMBER_IN_TEXT = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g;
const MAX_FREE_INTEGER = 10;

/** Extrae los números de un texto en español o inglés ("5.380,9", "0,74", "27.2"). */
export function extractNumbers(text: string): number[] {
  return (text.match(NUMBER_IN_TEXT) ?? []).map((raw) => {
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) {
      return Number(raw.replaceAll('.', '').replace(',', '.'));
    }
    return Number(raw.replace(',', '.'));
  });
}

function collect(value: unknown, out: number[]): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.push(value);
  } else if (typeof value === 'string') {
    const date = /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value) : null;
    if (date && !Number.isNaN(date.getTime())) {
      out.push(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
      );
    } else {
      out.push(...extractNumbers(value));
    }
  } else if (Array.isArray(value)) {
    value.forEach((v) => collect(v, out));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => collect(v, out));
  }
}

/** Números permitidos a partir de la evidencia y de los textos de referencia. */
export function allowedNumbers(...sources: unknown[]): number[] {
  const raw: number[] = [];
  sources.forEach((s) => collect(s, raw));

  const allowed = new Set<number>();
  for (const value of raw) {
    for (const v of [value, value * 100]) {
      const abs = Math.abs(v);
      allowed.add(abs);
      for (let d = 0; d <= 3; d++) allowed.add(Number(abs.toFixed(d)));
    }
  }
  return [...allowed];
}

/** Devuelve los números del texto que no aparecen en la evidencia. */
export function ungroundedNumbers(text: string, allowed: number[]): number[] {
  return extractNumbers(text).filter((n) => {
    if (Number.isInteger(n) && n <= MAX_FREE_INTEGER) return false;
    return !allowed.some((a) => Math.abs(n - a) <= Math.max(0.051, a * 0.005));
  });
}

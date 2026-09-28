/**
 * Control contra alucinaciones (F3-c): todo número que cite el LLM tiene que salir de la evidencia.
 *
 * Se aceptan las formas en que un número aparece en un texto: redondeado a 0–3 decimales, como
 * porcentaje (0,2722 → 27,2), en valor absoluto, y las partes de las fechas (día, mes, hora).
 * También los números del texto de referencia (plantilla) y los enteros pequeños ("3 pasos").
 */

// Un grupo de miles nunca empieza en 0: "0.936" es un decimal, no 936.
const THOUSANDS = /^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/;
const NUMBER_IN_TEXT = /[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g;
const MAX_FREE_INTEGER = 10;

/**
 * Interpretaciones posibles de cada número del texto. "5.380,9" es inequívoco, pero "1.070" puede
 * ser 1070 (miles en español) o 1,07 (decimal en inglés): se devuelven ambas.
 */
export function extractNumberCandidates(text: string): number[][] {
  return (text.match(NUMBER_IN_TEXT) ?? []).map((raw) => {
    if (THOUSANDS.test(raw)) {
      const asThousands = Number(raw.replaceAll('.', '').replace(',', '.'));
      return raw.includes(',') || raw.split('.').length > 2
        ? [asThousands]
        : [asThousands, Number(raw)];
    }
    return [Number(raw.replace(',', '.'))];
  });
}

/** Extrae los números de un texto en español o inglés ("5.380,9", "0,74", "27.2"). */
export function extractNumbers(text: string): number[] {
  return extractNumberCandidates(text).map((candidates) => candidates[0]!);
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

function isGrounded(n: number, allowed: number[]): boolean {
  if (Number.isInteger(n) && n <= MAX_FREE_INTEGER) return true;
  return allowed.some((a) => Math.abs(n - a) <= Math.max(0.051, a * 0.005));
}

/** Devuelve los números del texto que no aparecen en la evidencia (en ninguna interpretación). */
export function ungroundedNumbers(text: string, allowed: number[]): number[] {
  return extractNumberCandidates(text)
    .filter((candidates) => !candidates.some((n) => isGrounded(n, allowed)))
    .map((candidates) => candidates[0]!);
}

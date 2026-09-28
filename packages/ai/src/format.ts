/** Formato de números y fechas en español para los textos. */

const numberFormats = new Map<number, Intl.NumberFormat>();

export function num(value: number, decimals = 1): string {
  let format = numberFormats.get(decimals);
  if (!format) {
    format = new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    numberFormats.set(decimals, format);
  }
  return format.format(value).replace('-', '−');
}

/** Fracción → porcentaje con signo: 1.0791 → "+107,9 %". */
export function pct(fraction: number, decimals = 1): string {
  const value = fraction * 100;
  return `${value > 0 ? '+' : ''}${num(value, decimals)} %`;
}

export function kwh(value: number): string {
  return `${num(value, 1)} kWh`;
}

/** ISO UTC → "12/09 14:00 UTC". Las fechas se muestran en UTC (ADR 0004). */
export function when(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

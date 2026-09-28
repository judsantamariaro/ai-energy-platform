/**
 * Formato de números y fechas en español. Las fechas se muestran en UTC, igual que en los datos
 * (ADR 0004), para que una hora del CSV se vea igual en cualquier navegador.
 */
const numberFormats = new Map<string, Intl.NumberFormat>();

function formatter(min: number, max: number) {
  const key = `${min}-${max}`;
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat('es-CO', { minimumFractionDigits: min, maximumFractionDigits: max });
    numberFormats.set(key, f);
  }
  return f;
}

export function num(value: number, decimals = 0): string {
  return formatter(decimals, decimals).format(value);
}

export function kwh(value: number, decimals = 0): string {
  return `${num(value, decimals)} kWh`;
}

/** Energía con la unidad que mejor se lee: "155,3 MWh" o "820 kWh". */
export function energy(valueKwh: number): string {
  return Math.abs(valueKwh) >= 10_000 ? `${num(valueKwh / 1000, 1)} MWh` : kwh(valueKwh);
}

/** Fracción → porcentaje con signo: 1.0791 → "+107,9 %". */
export function pct(fraction: number, decimals = 1): string {
  const value = fraction * 100;
  const sign = value > 0.05 ? '+' : value < -0.05 ? '−' : '';
  return `${sign}${num(Math.abs(value), decimals)} %`;
}

/** Confianza 0–1 → "97 %". */
export function confidencePct(value: number): string {
  return `${num(value * 100, 0)} %`;
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "12/09 14:00" (UTC). */
export function shortDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "12 sep 2026, 14:00 UTC". */
export function dateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** "12 sep". */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Tiempo transcurrido: "hace 3 min", "hace 2 h", "hace 1 día". */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 45) return 'hace un momento';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

/** Duración entre dos instantes: "0,4 s", "27 s", "1 min 5 s". */
export function duration(startIso: string, endIso: string): string {
  const ms = Math.max(0, Date.parse(endIso) - Date.parse(startIso));
  if (ms < 100) return '< 0,1 s';
  if (ms < 10_000) return `${num(ms / 1000, 1)} s`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

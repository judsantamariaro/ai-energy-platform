import type { AnomalyType } from '@aiem/shared';
import type { Narrative } from './types.js';

/**
 * Reglas de contenido que la validación de números no cubre. Cada regla corresponde a un error
 * observado al comparar modelos locales (compare-models) o en la revisión del código.
 */
interface Rule {
  applies: (type: AnomalyType) => boolean;
  pattern: RegExp;
  /** Solo en los pasos que proponen algo (no en la explicación ni en los pasos que niegan). */
  stepsOnly?: boolean;
  message: string;
}

const always = () => true;
/** En estos tipos la causa no se conoce: el texto no puede afirmarla. */
const causeUnknown = (type: AnomalyType) => type === 'REAL_ANOMALY' || type === 'DATA_QUALITY';

const RULES: Rule[] = [
  {
    applies: always,
    pattern: /\d{4}-\d{2}-\d{2}T\d{2}/,
    message: 'usa una fecha en formato técnico',
  },
  {
    applies: always,
    pattern: /\bID\s*\d+|\bid\s+\d+/i,
    message: 'menciona un identificador interno',
  },
  {
    applies: always,
    pattern:
      /\b[a-z]{2,}(?:[A-Z][a-z]+)+\b|\b[A-Z]+(?:_[A-Z]+)*_(?:INCREASE|DROP|DEGRADATION|SHIFT|BAND|JUMPS|DISPERSION)\b/,
    message: 'menciona un nombre de campo o señal interna',
  },
  {
    applies: causeUnknown,
    pattern:
      /\bse deb(?:e|en|ió|ieron) a\b|\bdebid[oa]s? a\b|\ba causa de\b|\b(?:causad|provocad|originad)[oa]s? por\b|\bha(?:n)? sido identificad[oa]s?\b/i,
    message: 'afirma una causa que el análisis no conoce',
  },
  {
    applies: (type) => type === 'FALSE_POSITIVE',
    pattern: /\b(?:comunicar|notificar|avisar|informar)\b|\bescal(?:ar|arlo|arla|e|en)\b/i,
    stepsOnly: true,
    message: 'propone escalar un falso positivo',
  },
];

/** Un paso que empieza negando ("No escalar", "No es necesario comunicar nada") no propone nada. */
const NEGATED_STEP = /^\s*(?:no|sin)\b/i;

/** Devuelve las reglas que incumple el texto; vacío = aceptable. */
export function contentViolations(narrative: Narrative, type: AnomalyType): string[] {
  const all = [narrative.explanation, ...narrative.steps].join(' ');
  const proposedSteps = narrative.steps.filter((step) => !NEGATED_STEP.test(step)).join(' ');
  return RULES.filter(
    (r) => r.applies(type) && r.pattern.test(r.stepsOnly ? proposedSteps : all),
  ).map((r) => r.message);
}

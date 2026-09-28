import { describe, expect, it } from 'vitest';
import { allowedNumbers, ungroundedNumbers } from '../src/grounding.js';
import { promptPayload } from '../src/ollama.js';
import { RECOMMENDED_ACTIONS, templateNarrative, templateReason } from '../src/templates.js';
import { findingOf, findings } from './fixtures.js';

describe('plantillas sobre el dataset entregado', () => {
  it('M-109: frase corta al estilo del enunciado', () => {
    expect(templateReason(findingOf('M-109'))).toBe(
      'Consumo +107,9 % por encima del baseline sin evento que lo explique y con cambios eléctricos.',
    );
  });

  it('M-109: la explicación cita los cambios eléctricos y descarta el evento UNKNOWN', () => {
    const { explanation, steps } = templateNarrative(findingOf('M-109'));
    expect(explanation).toContain('12/09 14:00 UTC');
    expect(explanation).toContain('el factor de potencia bajó de 0,936 a 0,740');
    expect(explanation).toContain(
      'UNKNOWN («No operational event reported») y no explica el cambio',
    );
    expect(steps.some((s) => s.includes('compensación de energía reactiva'))).toBe(true);
  });

  it('M-112: cuenta las lecturas inconsistentes y destaca que el consumo es estable', () => {
    const f = findingOf('M-112');
    expect(templateReason(f)).toBe(
      'Lecturas eléctricas inconsistentes con consumo estable (32 de 47 lecturas afectadas).',
    );
    expect(templateNarrative(f).explanation).toContain('no a un cambio real de la carga');
  });

  it('M-104: nombra el cambio operativo que explica el aumento', () => {
    expect(templateNarrative(findingOf('M-104')).explanation).toContain(
      'Coincide con el evento OPERATIONAL_CHANGE del 11/09 00:00 UTC («New production line activated»)',
    );
  });

  it('M-106: compara la duración declarada por la parada con la observada', () => {
    const { explanation, steps } = templateNarrative(findingOf('M-106'));
    expect(explanation).toContain('El evento declara 12 h, igual a lo observado.');
    expect(steps[0]).toBe('No escalar.');
  });

  it('la acción principal sigue la tabla del enunciado', () => {
    expect(RECOMMENDED_ACTIONS).toEqual({
      REAL_ANOMALY: 'Investigar medidor e instalación',
      DATA_QUALITY: 'Validar medidor y datos',
      EXPLAINABLE_ANOMALY: 'Validar operación',
      FALSE_POSITIVE: 'No escalar',
    });
  });

  it.each(findings.map((f) => [f.meterId, f] as const))(
    '%s: todos los números de la plantilla están en la evidencia',
    (_, finding) => {
      const reason = templateReason(finding);
      const recommendedAction = RECOMMENDED_ACTIONS[finding.type];
      const { explanation, steps } = templateNarrative(finding);
      const allowed = allowedNumbers(
        promptPayload({ finding, meter: {}, reason, recommendedAction }),
      );

      expect(ungroundedNumbers([explanation, ...steps].join(' '), allowed)).toEqual([]);
    },
  );
});

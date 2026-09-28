import { describe, expect, it } from 'vitest';
import { analyze } from '@aiem/engine';
import { event, scaleLoadFrom, syntheticMeter } from '../../engine/test/synthetic.js';
import { DEFAULT_CONFIG } from '@aiem/engine';
import { allowedNumbers, ungroundedNumbers } from '../src/grounding.js';
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
    '%s: todos los números de la plantilla están en la evidencia o en los umbrales del motor',
    (_, finding) => {
      const { confidenceFactors: _factors, priority: _priority, ...evidence } = finding.evidence;
      const { explanation, steps } = templateNarrative(finding);
      // Los umbrales ("voltaje fuera de ±5 %") son hechos legítimos: salen de la configuración.
      const allowed = allowedNumbers(evidence, DEFAULT_CONFIG);

      expect(
        ungroundedNumbers([templateReason(finding), explanation, ...steps].join(' '), allowed),
      ).toEqual([]);
    },
  );
});

describe('plantilla de una parada que no duró lo declarado', () => {
  const readings = syntheticMeter({ transform: scaleLoadFrom(240, 0.2, 270) });
  const [finding] = analyze(readings, [
    event(240, 'SCHEDULED_OUTAGE', 'Outage for 10 hours'),
  ]).findings;

  it('explica que la parada solo cubre el inicio y pide confirmar con operación', () => {
    expect(finding!.type).toBe('EXPLAINABLE_ANOMALY');
    expect(templateReason(finding!)).toContain('duró distinto de la parada programada declarada');
    const { explanation, steps } = templateNarrative(finding!);
    expect(explanation).toContain('declara 10 h, pero la caída duró 30 h');
    expect(steps[0]).toContain('por qué la parada duró distinto');
    expect(RECOMMENDED_ACTIONS[finding!.type]).toBe('Validar operación');
  });
});

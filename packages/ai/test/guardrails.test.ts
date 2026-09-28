import { describe, expect, it } from 'vitest';
import { contentViolations } from '../src/guardrails.js';

const text = (explanation: string, steps: string[] = ['Revisar la instalación.']) => ({
  explanation,
  steps,
});

// Frases tomadas de respuestas reales de modelos locales (scripts/compare-models.ts).
describe('contentViolations', () => {
  it('rechaza afirmar una causa en una anomalía real', () => {
    const t = text('Este aumento se debe a una disminución del factor de potencia.');
    expect(contentViolations(t, 'REAL_ANOMALY')).toEqual([
      'afirma una causa que el análisis no conoce',
    ]);
  });

  it.each(['se debió a', 'a causa de', 'originado por', 'provocado por', 'debido a'])(
    'rechaza la causa afirmada con "%s"',
    (phrase) => {
      const t = text(`El aumento, ${phrase} una falla del motor, sigue activo.`);
      expect(contentViolations(t, 'REAL_ANOMALY')).toEqual([
        'afirma una causa que el análisis no conoce',
      ]);
    },
  );

  it('acepta hipótesis prudentes en una anomalía real', () => {
    const t = text(
      'Al mismo tiempo cayó el factor de potencia, lo que podría indicar una carga inductiva nueva.',
    );
    expect(contentViolations(t, 'REAL_ANOMALY')).toEqual([]);
  });

  it('permite la causa cuando un evento explica el cambio', () => {
    const t = text('La caída se debe a la parada programada.', ['No escalar.']);
    expect(contentViolations(t, 'FALSE_POSITIVE')).toEqual([]);
  });

  it('rechaza ids internos, fechas técnicas y nombres de campos', () => {
    expect(
      contentViolations(text('La evidencia está en el evento con ID 2.'), 'FALSE_POSITIVE'),
    ).toEqual(['menciona un identificador interno']);
    expect(
      contentViolations(
        text("El evento con timestamp '2026-09-11T00:00:00.000Z' explica el aumento."),
        'EXPLAINABLE_ANOMALY',
      ),
    ).toEqual(['usa una fecha en formato técnico']);
    expect(contentViolations(text('El meanDeviation fue alto.'), 'REAL_ANOMALY')).toEqual([
      'menciona un nombre de campo o señal interna',
    ]);
  });

  it('no confunde unidades como kWh con nombres de campo', () => {
    expect(contentViolations(text('Se consumieron 5.380,8 kWh.'), 'REAL_ANOMALY')).toEqual([]);
  });

  it('detecta códigos de señal con varios guiones bajos, pero no los tipos de evento', () => {
    expect(contentViolations(text('Hay POWER_FACTOR_DEGRADATION.'), 'REAL_ANOMALY')).toEqual([
      'menciona un nombre de campo o señal interna',
    ]);
    expect(
      contentViolations(
        text('Coincide con el evento OPERATIONAL_CHANGE del 11/09.'),
        'EXPLAINABLE_ANOMALY',
      ),
    ).toEqual([]);
  });

  it('rechaza proponer escalar o comunicar un falso positivo', () => {
    const t = text('Parada programada.', ['Comunicar a los operadores de red y a los clientes.']);
    expect(contentViolations(t, 'FALSE_POSITIVE')).toEqual(['propone escalar un falso positivo']);
    expect(
      contentViolations(text('Parada programada.', ['No escalar.']), 'FALSE_POSITIVE'),
    ).toEqual([]);
  });

  it.each(['Informar al jefe de mantenimiento.', 'Escalarlo al supervisor.'])(
    'en un falso positivo rechaza el paso "%s"',
    (step) => {
      expect(contentViolations(text('Parada programada.', [step]), 'FALSE_POSITIVE')).toEqual([
        'propone escalar un falso positivo',
      ]);
    },
  );

  it('un paso que niega no propone nada ("No es necesario comunicar nada")', () => {
    const t = text('Parada programada.', ['No es necesario comunicar nada.', 'No escalar.']);
    expect(contentViolations(t, 'FALSE_POSITIVE')).toEqual([]);
  });
});

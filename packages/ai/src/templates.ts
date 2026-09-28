import type { AnomalyType } from '@aiem/shared';
import type { EventEvidence, Finding } from '@aiem/engine';
import { kwh, num, pct, when } from './format.js';
import type { Narrative } from './types.js';

/** Acción principal por tipo (F3-f), tal como la plantea el enunciado. */
export const RECOMMENDED_ACTIONS: Record<AnomalyType, string> = {
  REAL_ANOMALY: 'Investigar medidor e instalación',
  DATA_QUALITY: 'Validar medidor y datos',
  EXPLAINABLE_ANOMALY: 'Validar operación',
  FALSE_POSITIVE: 'No escalar',
};

const quote = (e: EventEvidence) => (e.description ? ` («${e.description}»)` : '');

function changedVariables(finding: Finding): string[] {
  const e = finding.evidence.electrical;
  if (!e) return [];
  const parts: string[] = [];
  if (
    e.powerFactor.degraded &&
    e.powerFactor.baseline !== null &&
    e.powerFactor.observed !== null
  ) {
    parts.push(
      `el factor de potencia bajó de ${num(e.powerFactor.baseline, 3)} a ${num(e.powerFactor.observed, 3)}`,
    );
  }
  if (e.voltage.shifted && e.voltage.worstRollingDeviation !== null) {
    parts.push(`el voltaje llegó a desviarse ${pct(e.voltage.worstRollingDeviation)}`);
  }
  if (e.physicalRatio.shifted && e.physicalRatio.shift !== null) {
    parts.push(
      `la relación entre energía y potencia eléctrica (kWh / V·I·PF) cambió ${pct(e.physicalRatio.shift)}`,
    );
  }
  return parts;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function consumptionSentence(finding: Finding): string {
  const c = finding.evidence.consumption!;
  const w = finding.evidence.window;
  const relation = c.direction === 'UP' ? 'por encima de' : 'por debajo de';
  const span = w.ongoing
    ? `desde el ${when(w.start)} (${w.durationHours} h, sigue activo al final de los datos)`
    : `entre el ${when(w.start)} y el ${when(w.end)} (${w.durationHours} h)`;
  return (
    `${capitalize(span)} el consumo estuvo ${pct(c.meanDeviation)} ${relation} lo esperado para cada hora: ` +
    `${kwh(c.observedKwh)} frente a ${kwh(c.expectedKwh)} esperados.`
  );
}

/** Frase corta del hallazgo, al estilo del ejemplo del enunciado. */
export function templateReason(finding: Finding): string {
  const { evidence } = finding;
  const c = evidence.consumption;
  switch (finding.type) {
    case 'REAL_ANOMALY': {
      const relation = c!.direction === 'UP' ? 'por encima del' : 'por debajo del';
      const electrical = changedVariables(finding).length > 0 ? ' y con cambios eléctricos' : '';
      return `Consumo ${pct(c!.meanDeviation)} ${relation} baseline sin evento que lo explique${electrical}.`;
    }
    case 'EXPLAINABLE_ANOMALY':
      return c!.direction === 'DOWN'
        ? `Caída de consumo de ${pct(c!.meanDeviation)} que duró distinto de la parada programada declarada.`
        : `Consumo ${pct(c!.meanDeviation)} sobre el baseline, coincide con un cambio operativo registrado.`;
    case 'FALSE_POSITIVE':
      return `Caída de consumo de ${pct(c!.meanDeviation)} explicada por una parada programada; el consumo se recuperó.`;
    case 'DATA_QUALITY': {
      const dq = evidence.dataQuality!;
      return `Lecturas eléctricas inconsistentes con consumo estable (${dq.flaggedReadings} de ${dq.readingsInWindow} lecturas afectadas).`;
    }
  }
}

function realAnomaly(finding: Finding): Narrative {
  const changes = changedVariables(finding);
  const context = finding.evidence.events.filter((e) => e.role === 'NOT_EXPLANATORY');
  const e = finding.evidence.electrical!;

  const explanation = [
    consumptionSentence(finding),
    changes.length > 0
      ? `Al mismo tiempo, ${joinList(changes)}.`
      : 'Las variables eléctricas se mantuvieron estables.',
    context.length > 0
      ? `El único evento cercano es de tipo ${context[0]!.type}${quote(context[0]!)} y no explica el cambio.`
      : 'No hay eventos operativos registrados cerca del inicio.',
    'Por eso se clasifica como una anomalía real que requiere investigación.',
  ].join(' ');

  const steps = [
    `Inspeccionar en sitio las cargas conectadas desde el ${when(finding.evidence.window.start)}.`,
    ...(e.powerFactor.degraded
      ? [
          `Revisar la compensación de energía reactiva: el factor de potencia cayó a ${num(e.powerFactor.observed ?? 0, 3)}.`,
        ]
      : []),
    ...(e.voltage.shifted ? ['Medir la tensión en el punto de conexión.'] : []),
    ...(e.physicalRatio.shifted
      ? [
          'Verificar la calibración del medidor: la relación kWh / V·I·PF cambió respecto a su comportamiento habitual.',
        ]
      : []),
    'Confirmar con operación si hubo cambios no registrados en el sitio.',
  ];
  return { explanation, steps };
}

/** Caída que empezó con una parada programada, pero duró distinto de lo que declara el evento. */
function extendedOutage(finding: Finding): Narrative {
  const event = finding.evidence.events.find((e) => e.role === 'EXPLAINS')!;
  const observed = finding.evidence.window.durationHours;
  const explanation = [
    consumptionSentence(finding),
    `Empezó con el evento ${event.type} del ${when(event.timestamp)}${quote(event)}, que declara ` +
      `${num(event.declaredDurationHours ?? 0, 0)} h, pero la caída duró ${observed} h.`,
    'La parada explica el inicio, no toda la caída: por eso no se descarta como falso positivo.',
  ].join(' ');

  return {
    explanation,
    steps: [
      'Confirmar con operación por qué la parada duró distinto de lo programado.',
      'Verificar que los equipos volvieron a operar con normalidad después de la parada.',
      'Registrar la duración real de la parada para futuras planificaciones.',
    ],
  };
}

function explainableAnomaly(finding: Finding): Narrative {
  const event = finding.evidence.events.find((e) => e.role === 'EXPLAINS')!;
  if (finding.evidence.consumption?.direction === 'DOWN') return extendedOutage(finding);
  const changes = changedVariables(finding);
  const explanation = [
    consumptionSentence(finding),
    `Coincide con el evento ${event.type} del ${when(event.timestamp)}${quote(event)}.`,
    changes.length > 0
      ? `Sin embargo, ${joinList(changes)}: conviene revisarlo aunque el aumento esté explicado.`
      : 'Las variables eléctricas no muestran degradación, lo que es coherente con más carga funcionando con normalidad.',
  ].join(' ');

  return {
    explanation,
    steps: [
      'Confirmar con operación que el nuevo nivel de consumo corresponde a la carga esperada.',
      'Actualizar el baseline del medidor para que refleje el nuevo nivel de operación.',
      'Revisar el impacto del aumento en el costo y en el contrato de energía.',
    ],
  };
}

function declaredDurationSentence(event: EventEvidence, observedHours: number): string {
  if (event.declaredDurationHours === null) return '';
  const declared = num(event.declaredDurationHours, 0);
  return event.durationMatches
    ? ` El evento declara ${declared} h, igual a lo observado.`
    : ` El evento declara ${declared} h, distinto de las ${observedHours} h observadas.`;
}

function falsePositive(finding: Finding): Narrative {
  const event = finding.evidence.events.find((e) => e.role === 'EXPLAINS')!;
  const duration = declaredDurationSentence(event, finding.evidence.window.durationHours);
  const explanation =
    `${consumptionSentence(finding)} Coincide con el evento ${event.type} del ${when(event.timestamp)}${quote(event)}.` +
    `${duration} Después el consumo volvió a su nivel normal, así que no requiere acción.`;

  return {
    explanation,
    steps: ['No escalar.', 'Dejar registrada la parada como explicación del cambio de consumo.'],
  };
}

function dataQuality(finding: Finding): Narrative {
  const dq = finding.evidence.dataQuality!;
  const w = finding.evidence.window;
  const details: string[] = [];
  if (dq.voltageOutOfBand > 0)
    details.push(`${dq.voltageOutOfBand} con voltaje fuera de ±5 % de lo normal`);
  if (dq.voltageJumps > 0)
    details.push(`${dq.voltageJumps} con saltos de voltaje de más de 10 V entre horas seguidas`);
  if (
    dq.ratioDispersion.ratio !== null &&
    finding.evidence.signals.includes('PHYSICAL_RATIO_DISPERSION')
  ) {
    details.push(
      `una relación kWh / V·I·PF ${num(dq.ratioDispersion.ratio, 1)} veces más dispersa que en el resto del periodo`,
    );
  }
  const corroborating = finding.evidence.events.find((e) => e.role === 'CORROBORATES');

  const explanation = [
    `Desde el ${when(w.start)}, ${dq.flaggedReadings} de ${dq.readingsInWindow} lecturas tienen valores eléctricos incoherentes: ${joinList(details)}.`,
    dq.consumptionMeanDeviation !== null
      ? `El consumo, en cambio, se mantuvo a ${pct(dq.consumptionMeanDeviation)} de su baseline.`
      : '',
    'Esto apunta a un problema del medidor o de la transmisión de datos, no a un cambio real de la carga.',
    corroborating ? `Además, hay un evento registrado que lo confirma${quote(corroborating)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    explanation,
    steps: [
      'Validar el medidor en sitio: conexiones de tensión y corriente, y la comunicación de datos.',
      'No usar las lecturas eléctricas de esta ventana para facturación ni análisis hasta validarlas.',
      'Comparar con una medición independiente para confirmar el consumo real.',
    ],
  };
}

export function templateNarrative(finding: Finding): Narrative {
  switch (finding.type) {
    case 'REAL_ANOMALY':
      return realAnomaly(finding);
    case 'EXPLAINABLE_ANOMALY':
      return explainableAnomaly(finding);
    case 'FALSE_POSITIVE':
      return falsePositive(finding);
    case 'DATA_QUALITY':
      return dataQuality(finding);
  }
}

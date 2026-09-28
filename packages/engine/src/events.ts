import type { EngineConfig } from './config.js';
import type { ConsumptionIncident } from './detection/consumption.js';
import type { DataQualityIncident } from './detection/dataQuality.js';
import { HOUR_MS } from './stats.js';
import type { EventEvidence, EventInput, EventRole } from './types.js';

/** Extrae la duración declarada en la descripción ("for 12 hours", "8 horas", "2 days"). */
export function parseDeclaredDurationHours(description: string): number | null {
  const hours = /(\d+(?:[.,]\d+)?)\s*(?:hours?|hrs?|horas?|h)\b/i.exec(description);
  if (hours) return Number(hours[1]!.replace(',', '.'));
  const days = /(\d+(?:[.,]\d+)?)\s*(?:days?|d[ií]as?)\b/i.exec(description);
  if (days) return Number(days[1]!.replace(',', '.')) * 24;
  return null;
}

function durationMatches(declared: number | null, observed: number, config: EngineConfig) {
  if (declared === null) return null;
  const { durationToleranceHours, durationToleranceRelative } = config.events;
  const tolerance = Math.max(durationToleranceHours, declared * durationToleranceRelative);
  return Math.abs(observed - declared) <= tolerance;
}

function toEvidence(
  event: EventInput,
  referenceT: number,
  observedDurationHours: number,
  role: EventRole,
  note: string,
  config: EngineConfig,
): EventEvidence {
  const declared = parseDeclaredDurationHours(event.description);
  return {
    eventId: event.id ?? null,
    type: event.type,
    timestamp: new Date(Date.parse(event.timestamp)).toISOString(),
    description: event.description,
    offsetHours: (Date.parse(event.timestamp) - referenceT) / HOUR_MS,
    role,
    note,
    declaredDurationHours: declared,
    durationMatches: durationMatches(declared, observedDurationHours, config),
  };
}

/**
 * Qué eventos explican un incidente de consumo (A4). Solo dos tipos explican un cambio:
 * - OPERATIONAL_CHANGE explica un aumento.
 * - SCHEDULED_OUTAGE explica una caída de la que el consumo se recuperó.
 * El resto (UNKNOWN, DATA_QUALITY, tipos nuevos) queda como contexto, nunca como explicación.
 */
function roleForConsumption(event: EventInput, incident: ConsumptionIncident) {
  const type = event.type.toUpperCase();
  const quoted = event.description ? ` («${event.description}»)` : '';

  if (type === 'OPERATIONAL_CHANGE') {
    return incident.direction === 'UP'
      ? {
          role: 'EXPLAINS' as const,
          note: `Cambio operativo registrado al inicio del aumento${quoted}.`,
        }
      : {
          role: 'NOT_EXPLANATORY' as const,
          note: 'Un cambio operativo solo se acepta como explicación de un aumento de consumo.',
        };
  }
  if (type === 'SCHEDULED_OUTAGE') {
    if (incident.direction === 'UP') {
      return {
        role: 'NOT_EXPLANATORY' as const,
        note: 'Una parada programada no explica un aumento de consumo.',
      };
    }
    return incident.ongoing
      ? {
          role: 'NOT_EXPLANATORY' as const,
          note: 'Hubo una parada programada, pero el consumo no se recuperó al terminar.',
        }
      : {
          role: 'EXPLAINS' as const,
          note: `Parada programada que coincide con la caída; el consumo volvió a lo normal${quoted}.`,
        };
  }
  if (type === 'UNKNOWN') {
    return {
      role: 'NOT_EXPLANATORY' as const,
      note: `Evento sin causa operativa conocida${quoted}: no explica el cambio.`,
    };
  }
  if (type === 'DATA_QUALITY') {
    return {
      role: 'NOT_EXPLANATORY' as const,
      note: 'Un evento de calidad de datos no explica un cambio de consumo.',
    };
  }
  return {
    role: 'NOT_EXPLANATORY' as const,
    note: `El tipo de evento ${type} no tiene una regla de explicación.`,
  };
}

/** Eventos del medidor a ±`toleranceHours` del inicio del incidente (A7). */
export function assessConsumptionEvents(
  incident: ConsumptionIncident,
  meterEvents: EventInput[],
  config: EngineConfig,
): EventEvidence[] {
  const start = incident.points[0]!.t;
  const tolerance = config.events.toleranceHours * HOUR_MS;

  return meterEvents
    .filter((e) => Math.abs(Date.parse(e.timestamp) - start) <= tolerance)
    .map((event) => {
      const { role, note } = roleForConsumption(event, incident);
      return toEvidence(event, start, incident.durationHours, role, note, config);
    });
}

/** Eventos dentro de la ventana de calidad de datos (con la misma tolerancia en los bordes). */
export function assessDataQualityEvents(
  incident: DataQualityIncident,
  meterEvents: EventInput[],
  config: EngineConfig,
): EventEvidence[] {
  const start = incident.points[0]!.t;
  const end = incident.points.at(-1)!.t;
  const tolerance = config.events.toleranceHours * HOUR_MS;

  return meterEvents
    .filter((e) => {
      const t = Date.parse(e.timestamp);
      return t >= start - tolerance && t <= end + tolerance;
    })
    .map((event) => {
      const corroborates = event.type.toUpperCase() === 'DATA_QUALITY';
      return toEvidence(
        event,
        start,
        incident.durationHours,
        corroborates ? 'CORROBORATES' : 'NOT_EXPLANATORY',
        corroborates
          ? `Evento de calidad de datos registrado para este medidor («${event.description}»).`
          : 'Evento no relacionado con la calidad de los datos.',
        config,
      );
    });
}

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ErrorResponse,
  MeterDetail,
  MeterListItem,
  MeterListQuery,
  Reading,
  ReadingsQuery,
} from '@aiem/shared';
import type { AppDeps } from '../app.js';
import { getMeter, listMeters, listReadings, meterExists } from '../repositories/meters.js';

const MeterParams = z.object({ meterId: z.string() });
const notFound = (meterId: string) => ({
  error: 'Not Found',
  message: `No existe el medidor ${meterId}`,
});

export const meterRoutes: FastifyPluginAsyncZod<AppDeps> = async (app, { db }) => {
  app.get(
    '/meters',
    {
      schema: {
        tags: ['meters'],
        summary: 'Lista de medidores con filtros por estado, búsqueda y orden',
        querystring: MeterListQuery,
        response: { 200: z.array(MeterListItem) },
      },
    },
    async (request) => listMeters(db, request.query),
  );

  app.get(
    '/meters/:meterId',
    {
      schema: {
        tags: ['meters'],
        summary: 'Detalle de un medidor: consumo actual, baseline, anomalías y eventos',
        params: MeterParams,
        response: { 200: MeterDetail, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const meter = getMeter(db, request.params.meterId);
      return meter ?? reply.code(404).send(notFound(request.params.meterId));
    },
  );

  app.get(
    '/meters/:meterId/readings',
    {
      schema: {
        tags: ['meters'],
        summary: 'Serie horaria de lecturas (consumo, voltaje, corriente y factor de potencia)',
        params: MeterParams,
        querystring: ReadingsQuery,
        response: { 200: z.array(Reading), 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      if (!meterExists(db, request.params.meterId)) {
        return reply.code(404).send(notFound(request.params.meterId));
      }
      return listReadings(db, request.params.meterId, request.query);
    },
  );
};

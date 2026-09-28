import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AnomalyDetail,
  AnomalyListItem,
  AnomalyListQuery,
  ErrorResponse,
  UpdateAnomalyRequest,
} from '@aiem/shared';
import type { AppDeps } from '../app.js';
import {
  getAnomaly,
  listCurrentAnomalies,
  updateAnomalyStatus,
} from '../repositories/anomalies.js';
import { recomputeMeterStatuses } from '../repositories/meters.js';

const AnomalyParams = z.object({ id: z.string() });
const notFound = (id: string) => ({ error: 'Not Found', message: `No existe la anomalía ${id}` });

export const anomalyRoutes: FastifyPluginAsyncZod<AppDeps> = async (app, { db }) => {
  app.get(
    '/anomalies',
    {
      schema: {
        tags: ['anomalies'],
        summary: 'Anomalías del último análisis, de mayor a menor prioridad',
        querystring: AnomalyListQuery,
        response: { 200: z.array(AnomalyListItem) },
      },
    },
    async (request) => listCurrentAnomalies(db, request.query),
  );

  app.get(
    '/anomalies/:id',
    {
      schema: {
        tags: ['anomalies'],
        summary: 'Investigación: explicación, evidencia, eventos, acción recomendada e historial',
        params: AnomalyParams,
        response: { 200: AnomalyDetail, 404: ErrorResponse },
      },
    },
    async (request, reply) =>
      getAnomaly(db, request.params.id) ?? reply.code(404).send(notFound(request.params.id)),
  );

  app.patch(
    '/anomalies/:id',
    {
      schema: {
        tags: ['anomalies'],
        summary: 'Acción: cambia el estado de la anomalía y lo registra en el historial',
        params: AnomalyParams,
        body: UpdateAnomalyRequest,
        response: { 200: AnomalyDetail, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const updated = updateAnomalyStatus(
        db,
        id,
        { ...request.body, userId: request.user!.id },
        new Date(),
      );
      if (!updated) return reply.code(404).send(notFound(id));
      // Resolver o descartar una anomalía puede sacar al medidor de alerta.
      recomputeMeterStatuses(db);
      return getAnomaly(db, id)!;
    },
  );
};

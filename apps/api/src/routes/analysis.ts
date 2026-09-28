import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AnalysisRun, ErrorResponse } from '@aiem/shared';
import type { AppDeps } from '../app.js';
import { getRun, latestRun, toAnalysisRun } from '../repositories/runs.js';

export const analysisRoutes: FastifyPluginAsyncZod<AppDeps> = async (app, { db, analysis }) => {
  app.post(
    '/ai/analyze',
    {
      schema: {
        tags: ['analysis'],
        summary:
          'Run AI Analysis: lanza el análisis; el avance se consulta con GET /ai/analysis/:id',
        response: { 202: AnalysisRun, 409: AnalysisRun },
      },
    },
    async (_request, reply) => {
      const { run, conflict } = analysis.start();
      // 409: ya hay un análisis en curso; se devuelve para que el cliente siga su avance.
      return reply.code(conflict ? 409 : 202).send(toAnalysisRun(run));
    },
  );

  app.get(
    '/ai/analysis/latest',
    {
      schema: {
        tags: ['analysis'],
        summary: 'El análisis más reciente, en curso o terminado',
        response: { 200: AnalysisRun, 404: ErrorResponse },
      },
    },
    async (_request, reply) => {
      const run = latestRun(db);
      return run
        ? toAnalysisRun(run)
        : reply
            .code(404)
            .send({ error: 'Not Found', message: 'Aún no se ha ejecutado un análisis' });
    },
  );

  app.get(
    '/ai/analysis/:id',
    {
      schema: {
        tags: ['analysis'],
        summary: 'Estado de un análisis y de cada una de sus etapas',
        params: z.object({ id: z.string() }),
        response: { 200: AnalysisRun, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const run = getRun(db, request.params.id);
      return run
        ? toAnalysisRun(run)
        : reply
            .code(404)
            .send({ error: 'Not Found', message: `No existe el análisis ${request.params.id}` });
    },
  );
};

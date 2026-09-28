import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { DashboardSummary } from '@aiem/shared';
import { meters } from '../db/schema.js';
import type { AppDeps } from '../app.js';
import { listActiveAnomalies, listCurrentAnomalies } from '../repositories/anomalies.js';
import { consumptionOverview } from '../repositories/meters.js';
import { latestRun } from '../repositories/runs.js';

export const dashboardRoutes: FastifyPluginAsyncZod<AppDeps> = async (app, { db }) => {
  app.get(
    '/dashboard/summary',
    {
      schema: {
        tags: ['dashboard'],
        summary: 'KPIs del dashboard: medidores, consumo, anomalías, confianza y último análisis',
        response: { 200: DashboardSummary },
      },
    },
    async () => {
      const statuses = db.select({ status: meters.status }).from(meters).all();
      const current = listCurrentAnomalies(db);
      const active = listActiveAnomalies(db);
      const run = latestRun(db);
      const confidences = current.map((a) => a.confidence);

      return {
        meters: {
          total: statuses.length,
          byStatus: {
            OK: statuses.filter((m) => m.status === 'OK').length,
            ALERT: statuses.filter((m) => m.status === 'ALERT').length,
            CRITICAL: statuses.filter((m) => m.status === 'CRITICAL').length,
          },
        },
        consumption: consumptionOverview(db),
        anomalies: {
          detected: current.length,
          highPriority: active.filter((a) => a.severity === 'HIGH').length,
          averageConfidence:
            confidences.length > 0
              ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) /
                100
              : null,
          top: active.slice(0, 3),
        },
        lastAnalysis: run
          ? {
              id: run.id,
              status: run.status,
              createdAt: run.createdAt,
              finishedAt: run.finishedAt,
              summary: run.summary ?? null,
            }
          : null,
      };
    },
  );
};

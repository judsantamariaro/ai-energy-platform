import Fastify, { type FastifyServerOptions } from 'fastify';
import type { HealthResponse } from '@aiem/shared';

export const API_VERSION = '0.1.0';

/** Construye la app sin escuchar en un puerto, para poder testearla con `inject`. */
export function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);

  app.register(
    async (api) => {
      api.get('/health', async (): Promise<HealthResponse> => ({
        status: 'ok',
        version: API_VERSION,
      }));
    },
    { prefix: '/api' },
  );

  return app;
}

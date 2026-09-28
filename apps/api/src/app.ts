import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { HealthResponse } from '@aiem/shared';
import { registerSession, requireUser } from './auth/plugin.js';
import type { Db } from './db/client.js';
import { NO_LLM, type LlmService } from './llm/service.js';
import { analysisRoutes } from './routes/analysis.js';
import { anomalyRoutes } from './routes/anomalies.js';
import { authRoutes } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { meterRoutes } from './routes/meters.js';
import { createAnalysisService, type AnalysisService } from './services/analysis.js';

export const API_VERSION = '0.1.0';

export interface AppDeps {
  db: Db;
  llm: LlmService;
  analysis: AnalysisService;
  sessionSecret: string;
  sessionHours: number;
  secureCookies: boolean;
}

export type AppOptions = Pick<AppDeps, 'db' | 'sessionSecret'> &
  Partial<Omit<AppDeps, 'db' | 'sessionSecret'>>;

/** Construye la app sin escuchar en un puerto, para poder testearla con `inject`. */
export function buildApp(options: AppOptions, fastifyOptions: FastifyServerOptions = {}) {
  const app = Fastify(fastifyOptions).withTypeProvider<ZodTypeProvider>();
  const llm = options.llm ?? NO_LLM;
  const deps: AppDeps = {
    llm,
    analysis: options.analysis ?? createAnalysisService(options.db, llm, app.log),
    sessionHours: 8,
    secureCookies: false,
    ...options,
  };

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({ error: 'Bad Request', message: error.message });
    }
    if (isResponseSerializationError(error)) {
      request.log.error(error, 'La respuesta no cumple el contrato');
      return reply
        .code(500)
        .send({ error: 'Internal Server Error', message: 'Respuesta inválida' });
    }
    const status = error.statusCode ?? 500;
    if (status >= 500) request.log.error(error);
    // Algunos plugins (p. ej. rate-limit) lanzan objetos con `error` en lugar de `name`.
    const name = (error as { error?: unknown }).error;
    return reply.code(status).send({
      error:
        status >= 500
          ? 'Internal Server Error'
          : typeof name === 'string'
            ? name
            : error.name || 'Error',
      message: status >= 500 ? 'Error interno del servidor' : error.message || 'Error',
    });
  });
  app.setNotFoundHandler((request, reply) =>
    reply
      .code(404)
      .send({ error: 'Not Found', message: `No existe ${request.method} ${request.url}` }),
  );

  app.register(cookie);
  // Solo en las rutas que lo piden en su `config` (hoy, el login).
  app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Demasiados intentos. Vuelve a intentarlo en ${context.after}.`,
    }),
  });
  app.register(swagger, {
    openapi: {
      info: {
        title: 'AI Energy Management API',
        description: 'Medidores, lecturas, anomalías detectadas por el motor y análisis con IA.',
        version: API_VERSION,
      },
      components: {
        securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'aiem_session' } },
      },
      security: [{ session: [] }],
    },
    transform: jsonSchemaTransform,
  });
  app.register(swaggerUi, { routePrefix: '/docs' });
  registerSession(app, deps.db, deps.sessionSecret);

  // Rutas públicas
  app.register(
    async (api) => {
      api.withTypeProvider<ZodTypeProvider>().get(
        '/health',
        {
          schema: {
            tags: ['health'],
            summary: 'Estado de la API y del LLM local',
            response: { 200: HealthResponse },
          },
        },
        async () => ({ status: 'ok' as const, version: API_VERSION, llm: llm.status() }),
      );
      await api.register(authRoutes, deps);
    },
    { prefix: '/api' },
  );

  // Rutas protegidas: requieren sesión
  app.register(
    async (api) => {
      api.addHook('preHandler', requireUser);
      await api.register(meterRoutes, deps);
      await api.register(anomalyRoutes, deps);
      await api.register(analysisRoutes, deps);
      await api.register(dashboardRoutes, deps);
    },
    { prefix: '/api' },
  );

  return app;
}

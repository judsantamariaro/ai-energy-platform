import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorResponse, LoginRequest, User } from '@aiem/shared';
import { requireUser } from '../auth/plugin.js';
import { SESSION_COOKIE, createSessionToken } from '../auth/session.js';
import { authenticate, publicUser } from '../auth/users.js';
import type { AppDeps } from '../app.js';

export const authRoutes: FastifyPluginAsyncZod<AppDeps> = async (app, deps) => {
  const ttlMs = deps.sessionHours * 3_600_000;

  app.post(
    '/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Inicia sesión y deja la sesión en una cookie httpOnly',
        body: LoginRequest,
        response: { 200: User, 401: ErrorResponse, 429: ErrorResponse },
      },
      // Frena la fuerza bruta: 10 intentos por minuto por IP.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const user = await authenticate(deps.db, request.body.email, request.body.password);
      if (!user) {
        return reply
          .code(401)
          .send({ error: 'Unauthorized', message: 'Correo o contraseña incorrectos' });
      }
      reply.setCookie(SESSION_COOKIE, createSessionToken(user.id, deps.sessionSecret, ttlMs), {
        httpOnly: true,
        sameSite: 'lax',
        secure: deps.secureCookies,
        path: '/',
        maxAge: Math.floor(ttlMs / 1000),
      });
      return publicUser(user);
    },
  );

  app.post(
    '/auth/logout',
    { schema: { tags: ['auth'], summary: 'Cierra la sesión', response: { 204: z.null() } } },
    async (_request, reply) => {
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/auth/me',
    {
      preHandler: requireUser,
      schema: {
        tags: ['auth'],
        summary: 'Usuario de la sesión actual',
        response: { 200: User, 401: ErrorResponse },
      },
    },
    async (request) => publicUser(request.user!),
  );
};

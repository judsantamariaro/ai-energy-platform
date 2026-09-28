import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '../db/client.js';
import { SESSION_COOKIE, readSessionToken } from './session.js';
import { findUserById, type UserRow } from './users.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow | null;
  }
}

/** Lee la cookie de sesión en cada petición y deja el usuario en `request.user`. */
export function registerSession(app: FastifyInstance, db: Db, secret: string) {
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    const userId = token ? readSessionToken(token, secret) : null;
    request.user = userId !== null ? (findUserById(db, userId) ?? null) : null;
  });
}

/** preHandler para las rutas protegidas. */
export async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Inicia sesión para continuar' });
  }
}

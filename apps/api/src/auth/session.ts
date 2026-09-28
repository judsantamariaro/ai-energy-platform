import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token de sesión firmado con HMAC-SHA256: `<userId>.<expiraEnMs>.<firma>`. No guarda estado en el
 * servidor; va en una cookie httpOnly, así que el JavaScript del navegador no puede leerlo.
 */
export const SESSION_COOKIE = 'aiem_session';

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionToken(
  userId: number,
  secret: string,
  ttlMs: number,
  now = Date.now(),
) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0)
    throw new Error('La duración de la sesión no es válida');
  const payload = `${userId}.${now + ttlMs}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Devuelve el id del usuario si el token es auténtico y no expiró; si no, null. */
export function readSessionToken(token: string, secret: string, now = Date.now()): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expiresAt, signature] = parts as [string, string, string];

  const expected = Buffer.from(sign(`${userId}.${expiresAt}`, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const expires = Number(expiresAt);
  if (!Number.isFinite(expires) || expires <= now) return null;

  const id = Number(userId);
  return Number.isInteger(id) ? id : null;
}

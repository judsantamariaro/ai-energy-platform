import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
import { hashPassword, verifyPassword } from './password.js';

export type UserRow = typeof users.$inferSelect;

/** Crea el usuario de demostración si no existe. */
export function ensureUser(db: Db, user: { email: string; password: string; name: string }) {
  const email = user.email.toLowerCase();
  const existing = db.select().from(users).where(eq(users.email, email)).get();
  if (existing) return existing;
  return db
    .insert(users)
    .values({
      email,
      name: user.name,
      passwordHash: hashPassword(user.password),
      createdAt: new Date().toISOString(),
    })
    .returning()
    .get();
}

export function findUserById(db: Db, id: number): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

/** Hash de una contraseña que nadie tiene: se verifica contra él cuando el correo no existe. */
const DUMMY_HASH = hashPassword('usuario-inexistente');

/**
 * Si el correo no existe se verifica igual contra un hash de relleno: así el tiempo de respuesta
 * no revela qué correos están registrados.
 */
export async function authenticate(
  db: Db,
  email: string,
  password: string,
): Promise<UserRow | null> {
  const user = db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  return user && valid ? user : null;
}

export const publicUser = (u: UserRow) => ({ id: u.id, email: u.email, name: u.name });

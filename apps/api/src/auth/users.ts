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

export function authenticate(db: Db, email: string, password: string): UserRow | null {
  const user = db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
  return user && verifyPassword(password, user.passwordHash) ? user : null;
}

export const publicUser = (u: UserRow) => ({ id: u.id, email: u.email, name: u.name });

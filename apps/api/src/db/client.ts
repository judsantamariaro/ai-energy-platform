import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  db: Db;
  close: () => void;
}

/** Abre la base (archivo o `:memory:`) y aplica las migraciones pendientes. */
export function openDatabase(file: string, migrationsFolder: string): DatabaseHandle {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle({ client: sqlite, schema });
  migrate(db, { migrationsFolder });

  return { db, close: () => sqlite.close() };
}

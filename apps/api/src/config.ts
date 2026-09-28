import { resolve } from 'node:path';

// Las rutas por defecto son relativas a apps/api, que es el cwd de los scripts de pnpm.
const cwd = process.cwd();

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '127.0.0.1',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  databaseFile: process.env.DATABASE_FILE ?? resolve(cwd, '.data/aiem.db'),
  migrationsDir: process.env.MIGRATIONS_DIR ?? resolve(cwd, 'drizzle'),
  dataDir: process.env.DATA_DIR ?? resolve(cwd, '../../data'),
};

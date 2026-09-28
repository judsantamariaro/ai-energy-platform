import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

// Las rutas por defecto son relativas a apps/api, que es el cwd de los scripts de pnpm.
const cwd = process.cwd();

// .env opcional (ver .env.example); las variables ya definidas en el entorno tienen prioridad.
try {
  process.loadEnvFile(resolve(cwd, '.env'));
} catch {
  // Sin .env: se usan los valores por defecto.
}
const env = process.env;

export type LlmMode = 'auto' | 'ollama' | 'none';

export function positiveNumber(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} debe ser un número positivo (recibido: "${value}")`);
  }
  return n;
}

function llmMode(value: string | undefined): LlmMode {
  if (value === undefined || value === '') return 'auto';
  if (value === 'auto' || value === 'ollama' || value === 'none') return value;
  throw new Error(`LLM_PROVIDER inválido: "${value}" (usa auto, ollama o none)`);
}

export const config = {
  port: positiveNumber('PORT', env.PORT, 3000),
  host: env.HOST ?? '127.0.0.1',
  logLevel: env.LOG_LEVEL ?? 'info',
  databaseFile: env.DATABASE_FILE ?? resolve(cwd, '.data/aiem.db'),
  migrationsDir: env.MIGRATIONS_DIR ?? resolve(cwd, 'drizzle'),
  dataDir: env.DATA_DIR ?? resolve(cwd, '../../data'),
  auth: {
    /** Sin SESSION_SECRET se genera uno por arranque: las sesiones no sobreviven un reinicio. */
    sessionSecret: env.SESSION_SECRET ?? randomBytes(32).toString('hex'),
    sessionHours: positiveNumber('SESSION_HOURS', env.SESSION_HOURS, 8),
    /** Cookie solo por HTTPS: activar al desplegar detrás de TLS. */
    secureCookies: env.COOKIE_SECURE === 'true',
    demoUser: {
      email: env.DEMO_EMAIL ?? 'demo@bia.energy',
      password: env.DEMO_PASSWORD ?? 'energia2026',
      name: env.DEMO_NAME ?? 'Analista de energía',
    },
  },
  llm: {
    /** auto: usa Ollama si responde y tiene el modelo; si no, plantillas. */
    mode: llmMode(env.LLM_PROVIDER),
    ollamaUrl: env.OLLAMA_URL ?? 'http://127.0.0.1:11434',
    model: env.OLLAMA_MODEL ?? 'qwen2.5:3b',
    timeoutMs: positiveNumber('LLM_TIMEOUT_MS', env.LLM_TIMEOUT_MS, 60_000),
  },
};

export type Config = typeof config;

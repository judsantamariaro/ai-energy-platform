import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * Tests de punta a punta: levantan la API y la web reales en puertos propios (no chocan con
 * `pnpm dev`), sobre una base SQLite nueva en cada corrida.
 */
const API_PORT = 3100;
const WEB_PORT = 5174;

// Las capturas del README usan el LLM local si está disponible; los tests, siempre plantillas
// para que el resultado sea determinista.
const takingScreenshots = process.argv.some((arg) => arg.includes('screenshots'));

// En Windows se usa el Edge que trae el sistema: no hace falta descargar navegadores. En otros
// sistemas, PW_CHANNEL=chrome o `pnpm exec playwright install chromium`.
const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    viewport: { width: 1440, height: 900 },
    locale: 'es-CO',
    trace: 'retain-on-failure',
    ...(channel ? { channel } : {}),
  },
  projects: [
    { name: 'demo', testIgnore: /screenshots\.spec\.ts/ },
    { name: 'screenshots', testMatch: /screenshots\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'pnpm --filter @aiem/api exec tsx src/server.ts',
      cwd: '..',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        PORT: String(API_PORT),
        DATABASE_FILE: join(tmpdir(), `aiem-e2e-${Date.now()}.db`),
        LLM_PROVIDER: takingScreenshots ? 'auto' : 'none',
        SESSION_SECRET: 'e2e-secret',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: `pnpm --filter @aiem/web exec vite --port ${WEB_PORT} --strictPort`,
      cwd: '..',
      url: `http://localhost:${WEB_PORT}`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: { API_URL: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});

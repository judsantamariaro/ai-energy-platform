import type { InjectOptions } from 'fastify';
import { buildApp } from '../src/app.js';
import { ensureUser } from '../src/auth/users.js';
import { config } from '../src/config.js';
import { openDatabase } from '../src/db/client.js';
import { ingestDataset, loadDatasetFromDir } from '../src/ingestion/ingest.js';
import { NO_LLM, type LlmService } from '../src/llm/service.js';
import { createAnalysisService } from '../src/services/analysis.js';

export const DEMO = {
  email: 'demo@bia.energy',
  password: 'energia2026',
  name: 'Analista de energía',
};

/** App real sobre una base en memoria con el dataset entregado y el usuario de demo. */
export async function createTestApp(options: { llm?: LlmService } = {}) {
  const database = openDatabase(':memory:', config.migrationsDir);
  const { db } = database;
  ingestDataset(db, loadDatasetFromDir(config.dataDir));
  ensureUser(db, DEMO);

  const llm = options.llm ?? NO_LLM;
  const analysis = createAnalysisService(db, llm, { error: () => {} });
  const app = buildApp({ db, llm, analysis, sessionSecret: 'test-secret' });
  await app.ready();

  async function login(email = DEMO.email, password = DEMO.password) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password },
    });
    const cookie = res.cookies.find((c) => c.name === 'aiem_session');
    return { res, cookie: cookie ? `${cookie.name}=${cookie.value}` : null };
  }
  const { cookie } = await login();

  /** Petición autenticada con la sesión del usuario de demo. */
  const api = (method: InjectOptions['method'], url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie: cookie! } });

  /** Run AI Analysis y espera a que termine. */
  async function runAnalysis() {
    const res = await api('POST', '/api/ai/analyze');
    const id = res.json().id as string;
    await analysis.wait(id);
    return { res, id };
  }

  return {
    app,
    db,
    api,
    login,
    runAnalysis,
    close: async () => {
      await app.close();
      database.close();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

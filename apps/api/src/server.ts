import { buildApp } from './app.js';
import { ensureUser } from './auth/users.js';
import { config } from './config.js';
import { openDatabase } from './db/client.js';
import { ingestDataset, isDatabaseEmpty, loadDatasetFromDir } from './ingestion/ingest.js';
import { formatIngestionReport } from './ingestion/report.js';
import { createLlmService } from './llm/service.js';
import { failInterruptedRuns } from './repositories/runs.js';

const database = openDatabase(config.databaseFile, config.migrationsDir);
const { db } = database;

const bootLog = {
  info: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(msg),
};
const llm = createLlmService(config.llm, bootLog);

const app = buildApp(
  {
    db,
    llm,
    sessionSecret: config.auth.sessionSecret,
    sessionHours: config.auth.sessionHours,
    secureCookies: config.auth.secureCookies,
  },
  { logger: { level: config.logLevel } },
);
app.addHook('onClose', async () => database.close());

try {
  if (isDatabaseEmpty(db)) {
    const report = ingestDataset(db, loadDatasetFromDir(config.dataDir));
    app.log.info(
      `Base vacía: datos cargados desde ${config.dataDir}\n${formatIngestionReport(report)}`,
    );
  }
  ensureUser(db, config.auth.demoUser);
  const interrupted = failInterruptedRuns(db, new Date());
  if (interrupted > 0) app.log.warn(`${interrupted} análisis interrumpidos por un reinicio`);
  if (!process.env.SESSION_SECRET) {
    app.log.warn('Sin SESSION_SECRET: las sesiones se invalidan al reiniciar la API');
  }

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Documentación de la API en http://${config.host}:${config.port}/docs`);

  // Sin bloquear el arranque: detecta el LLM local y lo carga en memoria para la demo.
  void llm.warmUp();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

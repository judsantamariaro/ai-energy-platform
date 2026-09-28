import { buildApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db/client.js';
import { ingestDataset, isDatabaseEmpty, loadDatasetFromDir } from './ingestion/ingest.js';
import { formatIngestionReport } from './ingestion/report.js';

const app = buildApp({ logger: { level: config.logLevel } });

try {
  const database = openDatabase(config.databaseFile, config.migrationsDir);
  app.addHook('onClose', async () => database.close());

  if (isDatabaseEmpty(database.db)) {
    const report = ingestDataset(database.db, loadDatasetFromDir(config.dataDir));
    app.log.info(
      `Base vacía: datos cargados desde ${config.dataDir}\n${formatIngestionReport(report)}`,
    );
  }

  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

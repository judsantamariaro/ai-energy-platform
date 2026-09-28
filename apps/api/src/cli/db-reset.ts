/** Borra la base SQLite y la regenera desde data/*.csv. */
import { rmSync } from 'node:fs';
import { config } from '../config.js';
import { openDatabase } from '../db/client.js';
import { ingestDataset, loadDatasetFromDir } from '../ingestion/ingest.js';
import { formatIngestionReport } from '../ingestion/report.js';

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(config.databaseFile + suffix, { force: true });
}

const { db, close } = openDatabase(config.databaseFile, config.migrationsDir);
try {
  const report = ingestDataset(db, loadDatasetFromDir(config.dataDir));
  console.log(`Base regenerada en ${config.databaseFile}\n${formatIngestionReport(report)}`);
} finally {
  close();
}

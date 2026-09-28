import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AnalysisRun, AnalysisStage } from '@aiem/shared';
import { AnalysisStage as Stages } from '@aiem/shared';
import type { Db } from '../db/client.js';
import { analysisRuns } from '../db/schema.js';

export type RunRow = typeof analysisRuns.$inferSelect;

export function toAnalysisRun(row: RunRow): AnalysisRun {
  return {
    id: row.id,
    status: row.status,
    stages: row.stages,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    summary: row.summary ?? null,
    error: row.error,
  };
}

export function createRun(db: Db, id: string, now: Date): RunRow {
  return db
    .insert(analysisRuns)
    .values({
      id,
      status: 'PENDING',
      createdAt: now.toISOString(),
      stages: Stages.options.map((stage: AnalysisStage) => ({
        stage,
        status: 'PENDING' as const,
        startedAt: null,
        finishedAt: null,
        summary: null,
      })),
    })
    .returning()
    .get();
}

export function getRun(db: Db, id: string): RunRow | undefined {
  return db.select().from(analysisRuns).where(eq(analysisRuns.id, id)).get();
}

export function updateRun(db: Db, id: string, patch: Partial<Omit<RunRow, 'id'>>): void {
  db.update(analysisRuns).set(patch).where(eq(analysisRuns.id, id)).run();
}

export function activeRun(db: Db): RunRow | undefined {
  return db
    .select()
    .from(analysisRuns)
    .where(inArray(analysisRuns.status, ['PENDING', 'RUNNING']))
    .get();
}

export function latestRun(db: Db): RunRow | undefined {
  return db.select().from(analysisRuns).orderBy(desc(analysisRuns.createdAt)).limit(1).get();
}

/** El último análisis completado: sus hallazgos son los vigentes. */
export function latestCompletedRun(db: Db): RunRow | undefined {
  return db
    .select()
    .from(analysisRuns)
    .where(eq(analysisRuns.status, 'COMPLETED'))
    .orderBy(desc(analysisRuns.finishedAt))
    .limit(1)
    .get();
}

/** Al arrancar, un análisis que quedó a medias por un reinicio se marca como fallido. */
export function failInterruptedRuns(db: Db, now: Date): number {
  return db
    .update(analysisRuns)
    .set({
      status: 'FAILED',
      finishedAt: now.toISOString(),
      error: 'Interrumpido por un reinicio del servidor',
    })
    .where(and(inArray(analysisRuns.status, ['PENDING', 'RUNNING'])))
    .run().changes;
}

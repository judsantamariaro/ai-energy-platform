import { randomUUID } from 'node:crypto';
import { generateInsight, type Insight } from '@aiem/ai';
import { analyze, type Finding } from '@aiem/engine';
import type { AnalysisStage, AnalysisStageState, AnalysisSummary } from '@aiem/shared';
import { AnalysisStage as Stages } from '@aiem/shared';
import type { Db } from '../db/client.js';
import type { LlmService } from '../llm/service.js';
import { saveFindings } from '../repositories/anomalies.js';
import { loadAnalysisInput } from '../repositories/dataset.js';
import { recomputeMeterStatuses } from '../repositories/meters.js';
import { activeRun, createRun, getRun, updateRun, type RunRow } from '../repositories/runs.js';

export interface AnalysisService {
  /** Crea y lanza un análisis. Si ya hay uno en curso, lo devuelve en `conflict`. */
  start(): { run: RunRow; conflict: boolean };
  /** Espera a que termine un análisis lanzado en este proceso (útil en tests y scripts). */
  wait(id: string): Promise<void>;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function createAnalysisService(
  db: Db,
  llm: LlmService,
  log: { error: (obj: unknown, msg: string) => void },
  clock: () => Date = () => new Date(),
): AnalysisService {
  const inFlight = new Map<string, Promise<void>>();

  /** Actualiza el estado de las etapas del análisis en la base, para que la UI vea el avance. */
  function stageTracker(runId: string) {
    let stages: AnalysisStageState[] = getRun(db, runId)!.stages;
    const save = () => updateRun(db, runId, { stages });
    const patch = (stage: AnalysisStage, changes: Partial<AnalysisStageState>) => {
      stages = stages.map((s) => (s.stage === stage ? { ...s, ...changes } : s));
      save();
    };
    return {
      start: (stage: AnalysisStage, summary: string | null = null) =>
        patch(stage, { status: 'RUNNING', startedAt: clock().toISOString(), summary }),
      progress: (stage: AnalysisStage, summary: string) => patch(stage, { summary }),
      done(stage: AnalysisStage, summary: string) {
        patch(stage, { status: 'DONE', finishedAt: clock().toISOString(), summary });
        const next = Stages.options[Stages.options.indexOf(stage) + 1];
        if (next) this.start(next);
      },
      /** Estado de las etapas con `stage` terminada, sin guardarlo (para escribirlo en una transacción). */
      completed(stage: AnalysisStage, summary: string): AnalysisStageState[] {
        return stages.map((s) =>
          s.stage === stage
            ? { ...s, status: 'DONE', finishedAt: clock().toISOString(), summary }
            : s,
        );
      },
      /** Adopta un estado ya guardado por otra escritura (la transacción final). */
      adopt(saved: AnalysisStageState[]) {
        stages = saved;
      },
      failRunning(message: string) {
        stages = stages.map((s) =>
          s.status === 'RUNNING'
            ? { ...s, status: 'FAILED', finishedAt: clock().toISOString(), summary: message }
            : s,
        );
        save();
      },
    };
  }

  async function explain(
    findings: Finding[],
    meters: ReturnType<typeof loadAnalysisInput>['meters'],
    stages: ReturnType<typeof stageTracker>,
  ) {
    const provider = await llm.resolve();
    const writer = provider ? `el modelo local ${provider.model}` : 'plantillas';
    const insights: Insight[] = [];

    for (const [i, finding] of findings.entries()) {
      stages.progress(
        'EXPLANATION',
        `Redactando ${i + 1} de ${findings.length} (${finding.meterId}) con ${writer}…`,
      );
      insights.push(await generateInsight(finding, { provider, meters }));
    }

    const fromLlm = insights.filter((i) => i.source === 'LLM').length;
    const summary = !provider
      ? `${plural(insights.length, 'explicación generada', 'explicaciones generadas')} con plantillas (sin LLM local disponible).`
      : `${fromLlm} de ${insights.length} explicaciones redactadas por ${provider.model}` +
        (fromLlm < insights.length
          ? `; ${insights.length - fromLlm} con plantilla porque la respuesta no pasó los controles.`
          : '.');
    stages.done('EXPLANATION', summary);
    return { insights, provider, fromLlm };
  }

  async function execute(runId: string) {
    let stages: ReturnType<typeof stageTracker> | null = null;
    try {
      stages = stageTracker(runId);
      updateRun(db, runId, { status: 'RUNNING', startedAt: clock().toISOString() });
      stages.start('READINGS');

      const input = loadAnalysisInput(db);
      const result = analyze(input.readings, input.events, {
        onStage: (stage, summary) => stages!.done(stage, summary),
      });

      const { insights, provider, fromLlm } = await explain(result.findings, input.meters, stages);

      const actions = new Map<string, number>();
      for (const i of insights) {
        actions.set(i.recommendedAction, (actions.get(i.recommendedAction) ?? 0) + 1);
      }
      const now = clock();
      const summary: AnalysisSummary = {
        anomaliesDetected: result.summary.anomaliesDetected,
        highPriority: result.summary.highPriority,
        averageConfidence: result.summary.averageConfidence,
        llm: provider ? { provider: provider.name, model: provider.model } : null,
        insightsFromLlm: fromLlm,
        message:
          `${plural(result.summary.anomaliesDetected, 'anomalía detectada', 'anomalías detectadas')} · ` +
          `${result.summary.highPriority} ${result.summary.highPriority === 1 ? 'requiere' : 'requieren'} atención prioritaria`,
      };
      // La última etapa se marca en la misma transacción que completa el análisis: si la
      // transacción falla, la etapa queda RUNNING y se registra como fallida.
      const finalStages = stages.completed(
        'RECOMMENDATION',
        actions.size === 0
          ? 'Sin acciones: no hay anomalías.'
          : [...actions].map(([action, n]) => `${n} × ${action}`).join(' · '),
      );

      db.transaction((tx) => {
        saveFindings(
          tx,
          runId,
          result.findings.map((finding, i) => ({ finding, insight: insights[i]! })),
          now,
        );
        updateRun(tx, runId, {
          status: 'COMPLETED',
          finishedAt: now.toISOString(),
          summary,
          meterSummaries: result.meters,
          stages: finalStages,
        });
        recomputeMeterStatuses(tx);
      });
      stages.adopt(finalStages);
    } catch (err) {
      const message = (err as Error).message;
      log.error(err, `El análisis ${runId} falló`);
      try {
        stages?.failRunning(message);
        updateRun(db, runId, {
          status: 'FAILED',
          finishedAt: clock().toISOString(),
          error: message,
        });
      } catch (inner) {
        // Si ni siquiera se puede registrar el fallo (p. ej. la base se cerró), no tumbar la API.
        log.error(inner, `No se pudo registrar el fallo del análisis ${runId}`);
      }
    }
  }

  return {
    start() {
      const current = activeRun(db);
      if (current) return { run: current, conflict: true };

      const run = createRun(db, randomUUID(), clock());
      // Se ejecuta después de responder: el cliente consulta el avance con GET /ai/analysis/:id.
      const promise = new Promise<void>((resolve) => setImmediate(resolve))
        .then(() => execute(run.id))
        // Última red: un rechazo sin capturar terminaría el proceso de Node.
        .catch((err: unknown) => log.error(err, `Error inesperado en el análisis ${run.id}`))
        .finally(() => inFlight.delete(run.id));
      inFlight.set(run.id, promise);
      return { run, conflict: false };
    },
    wait: (id) => inFlight.get(id) ?? Promise.resolve(),
  };
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle2, Circle, Loader2, Sparkles, XCircle } from 'lucide-react';
import type { AnalysisRun, AnalysisStageState } from '@aiem/shared';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useLatestAnalysis, useStartAnalysis } from '@/hooks/api';
import { duration, timeAgo } from '@/lib/format';
import { STAGE } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { AnalysisPanelContext, useAnalysisPanel, type AnalysisPanelState } from './context';

/** Intervalo con el que se revelan las etapas: las del motor terminan en milisegundos. */
const REVEAL_MS = 450;

/**
 * Cuántas etapas mostrar como terminadas. Si el análisis se sigue en vivo, se revelan de a una;
 * si ya estaba terminado al abrir el panel, se muestran todas.
 */
function useRevealedStages(run: AnalysisRun | null | undefined, live: boolean) {
  const done = run?.stages.filter((s) => s.status === 'DONE').length ?? 0;
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!live || revealed >= done) return;
    const timer = setTimeout(() => setRevealed((n) => n + 1), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [done, revealed, live]);

  const shown = live ? Math.min(revealed, done) : done;
  return { shown, allShown: shown >= done };
}

function StageRow({
  stage,
  display,
}: {
  stage: AnalysisStageState;
  display: 'pending' | 'running' | 'done' | 'failed';
}) {
  const meta = STAGE[stage.stage];
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <div className="flex flex-col items-center">
        {display === 'done' && <CheckCircle2 className="size-5 text-ok" />}
        {display === 'running' && <Loader2 className="size-5 animate-spin text-primary" />}
        {display === 'failed' && <XCircle className="size-5 text-critical" />}
        {display === 'pending' && <Circle className="size-5 text-muted-foreground/40" />}
        <span className="mt-1 w-px flex-1 bg-border" />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn('font-medium', display === 'pending' && 'text-muted-foreground')}>
            {meta.label}
          </span>
          {display === 'done' && stage.startedAt && stage.finishedAt && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {duration(stage.startedAt, stage.finishedAt)}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {display === 'done' ||
          display === 'failed' ||
          (display === 'running' && stage.status === 'RUNNING' && stage.summary)
            ? stage.summary
            : meta.description}
        </p>
      </div>
    </li>
  );
}

function PanelBody({ run, live }: { run: AnalysisRun; live: boolean }) {
  const { shown, allShown } = useRevealedStages(run, live);
  const finished = allShown && (run.status === 'COMPLETED' || run.status === 'FAILED');

  return (
    <>
      <ol className="px-4">
        {run.stages.map((stage, i) => {
          const display =
            stage.status === 'FAILED' && allShown
              ? 'failed'
              : i < shown
                ? 'done'
                : i === shown && run.status !== 'FAILED' && !finished
                  ? 'running'
                  : 'pending';
          return <StageRow key={stage.stage} stage={stage} display={display} />;
        })}
      </ol>

      {finished && run.status === 'COMPLETED' && run.summary && (
        <div className="mx-4 space-y-1 rounded-xl bg-accent p-4">
          <p className="text-base font-semibold text-accent-foreground">{run.summary.message}</p>
          <p className="text-sm text-accent-foreground/80">
            {run.summary.llm
              ? `Explicaciones redactadas por ${run.summary.llm.model} (modelo local).`
              : 'Explicaciones generadas con plantillas a partir de la evidencia.'}{' '}
            {run.finishedAt && `Terminó ${timeAgo(run.finishedAt)}.`}
          </p>
        </div>
      )}
      {finished && run.status === 'FAILED' && (
        <div className="mx-4 rounded-xl bg-critical-soft p-4 text-sm text-critical">
          El análisis falló: {run.error}
        </div>
      )}
    </>
  );
}

export function AnalysisPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // "En vivo" solo si el panel se abrió mientras el análisis corría: así se animan las etapas.
  const [live, setLive] = useState(false);
  const { data: run, running } = useLatestAnalysis();
  const start = useStartAnalysis();
  const navigate = useNavigate();

  const value: AnalysisPanelState = {
    open: () => {
      setLive(running);
      setOpen(true);
    },
    run: () => {
      setLive(true);
      setOpen(true);
      if (!running) start.mutate();
    },
  };

  return (
    <AnalysisPanelContext.Provider value={value}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full gap-5 overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> Análisis IA
            </SheetTitle>
            <SheetDescription>
              Lecturas → Baseline → Detección → Correlación → Eventos → Explicación → Recomendación
            </SheetDescription>
          </SheetHeader>

          {run ? (
            <PanelBody key={run.id} run={run} live={live} />
          ) : (
            <p className="px-4 text-sm text-muted-foreground">
              Aún no se ha ejecutado un análisis.
            </p>
          )}

          <SheetFooter className="flex-row justify-end gap-2">
            {run?.status === 'COMPLETED' && (
              <Button
                onClick={() => {
                  setOpen(false);
                  navigate('/anomalies');
                }}
              >
                Ver anomalías
              </Button>
            )}
            <Button variant="outline" onClick={value.run} disabled={running || start.isPending}>
              {running ? 'Analizando…' : run ? 'Volver a analizar' : 'Run AI Analysis'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </AnalysisPanelContext.Provider>
  );
}

/** Botón principal de la barra superior. */
export function RunAnalysisButton() {
  const { run: start, open } = useAnalysisPanel();
  const { data: run, running } = useLatestAnalysis();
  const done = run?.stages.filter((s) => s.status === 'DONE').length ?? 0;

  if (running) {
    return (
      <Button onClick={open} variant="outline" className="gap-2">
        <Loader2 className="size-4 animate-spin text-primary" />
        Analizando… {done}/7
      </Button>
    );
  }
  return (
    <Button onClick={start} className="gap-2">
      <Sparkles className="size-4" />
      Run AI Analysis
    </Button>
  );
}

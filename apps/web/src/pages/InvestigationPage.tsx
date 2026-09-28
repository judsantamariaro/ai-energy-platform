import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft,
  Bot,
  CalendarClock,
  CheckCircle2,
  FileText,
  Loader2,
  PlayCircle,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Evidence } from '@aiem/engine';
import type { AnomalyDetail, AnomalyStatus } from '@aiem/shared';
import { MeterSeriesChart } from '@/components/charts/MeterSeriesChart';
import { ErrorState, LoadingBlock } from '@/components/common';
import {
  AnomalyStatusBadge,
  AnomalyTypeBadge,
  Confidence,
  Pill,
  SeverityBadge,
} from '@/components/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useAnomaly, useMeter, useReadings, useUpdateAnomaly } from '@/hooks/api';
import { dateTime, kwh, num, pct } from '@/lib/format';
import { ANOMALY_STATUS, ANOMALY_TYPE_HINT, EVENT_ROLE, SIGNAL } from '@/lib/labels';
import { cn } from '@/lib/utils';

function Section({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Filas "baseline → observado" de las variables que evalúa el motor. */
function ChangedVariables({ evidence }: { evidence: Evidence }) {
  const rows: {
    label: string;
    baseline: string;
    observed: string;
    change: string;
    flagged: boolean;
  }[] = [];
  const c = evidence.consumption;
  if (c) {
    rows.push({
      label: 'Consumo en la ventana',
      baseline: kwh(c.expectedKwh),
      observed: kwh(c.observedKwh),
      change: pct(c.meanDeviation),
      flagged: true,
    });
  }
  const e = evidence.electrical;
  if (e) {
    const pf = e.powerFactor;
    if (pf.baseline !== null && pf.observed !== null) {
      rows.push({
        label: 'Factor de potencia',
        baseline: num(pf.baseline, 3),
        observed: num(pf.observed, 3),
        change:
          pf.delta !== null ? `${pf.delta > 0 ? '+' : '−'}${num(Math.abs(pf.delta), 3)}` : '—',
        flagged: pf.degraded,
      });
    }
    const v = e.voltage;
    if (v.baseline !== null && v.observed !== null) {
      rows.push({
        label: 'Voltaje',
        baseline: `${num(v.baseline, 1)} V`,
        observed: `${num(v.observed, 1)} V`,
        change:
          v.worstRollingDeviation !== null
            ? `${pct(v.worstRollingDeviation)} (peor tramo de 6 h)`
            : '—',
        flagged: v.shifted,
      });
    }
    const k = e.physicalRatio;
    if (k.baseline !== null && k.observed !== null) {
      rows.push({
        label: 'Relación kWh / V·I·PF',
        baseline: num(k.baseline, 3),
        observed: num(k.observed, 3),
        change: k.shift !== null ? pct(k.shift) : '—',
        flagged: k.shifted,
      });
    }
  }
  const dq = evidence.dataQuality;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {evidence.signals.map((s) => (
          <Pill key={s} tone="info">
            {SIGNAL[s]}
          </Pill>
        ))}
      </div>
      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 font-medium">Variable</th>
              <th className="py-2 text-right font-medium">Esperado</th>
              <th className="py-2 text-right font-medium">Observado</th>
              <th className="py-2 text-right font-medium">Cambio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b last:border-0">
                <td className="py-2.5">
                  <span className={cn(r.flagged && 'font-medium')}>{r.label}</span>
                </td>
                <td className="py-2.5 text-right text-muted-foreground tabular-nums">
                  {r.baseline}
                </td>
                <td className="py-2.5 text-right tabular-nums">{r.observed}</td>
                <td
                  className={cn(
                    'py-2.5 text-right tabular-nums',
                    r.flagged ? 'font-medium text-critical' : 'text-muted-foreground',
                  )}
                >
                  {r.change}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {dq && (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ['Lecturas afectadas', `${dq.flaggedReadings} de ${dq.readingsInWindow}`],
            ['Voltaje fuera de ±5 %', String(dq.voltageOutOfBand)],
            ['Saltos de voltaje > 10 V', String(dq.voltageJumps)],
            [
              'Dispersión de kWh / V·I·PF',
              dq.ratioDispersion.ratio !== null
                ? `${num(dq.ratioDispersion.ratio, 1)} × lo normal`
                : '—',
            ],
            [
              'Consumo frente al baseline',
              dq.consumptionMeanDeviation !== null ? pct(dq.consumptionMeanDeviation) : '—',
            ],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-muted/60 p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function RelatedEvents({ evidence }: { evidence: Evidence }) {
  if (evidence.events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay eventos operativos registrados cerca del inicio del incidente.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {evidence.events.map((e) => (
        <li key={`${e.type}-${e.timestamp}`} className="flex gap-3 rounded-xl border p-4">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{e.type}</span>
              <Pill
                tone={e.role === 'EXPLAINS' ? 'ok' : e.role === 'CORROBORATES' ? 'info' : 'muted'}
              >
                {EVENT_ROLE[e.role]}
              </Pill>
              <span className="text-xs text-muted-foreground">
                {dateTime(e.timestamp)}
                {e.offsetHours !== 0 &&
                  ` · ${num(Math.abs(e.offsetHours), 1)} h ${e.offsetHours < 0 ? 'antes' : 'después'} del inicio`}
              </span>
            </div>
            {e.description && <p className="text-sm">«{e.description}»</p>}
            <p className="text-sm text-muted-foreground">{e.note}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ConfidenceBreakdown({
  anomaly,
  evidence,
}: {
  anomaly: AnomalyDetail;
  evidence: Evidence;
}) {
  const p = evidence.priority;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/60 p-3">
          <div className="text-xs text-muted-foreground">Confianza</div>
          <Confidence value={anomaly.confidence} className="text-base" />
        </div>
        <div className="rounded-lg bg-muted/60 p-3">
          <div className="text-xs text-muted-foreground">Prioridad</div>
          <div className="text-base font-medium tabular-nums">
            {num(p.total, 1)}{' '}
            <span className="text-sm font-normal text-muted-foreground">de 100</span>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-medium">Por qué esa confianza</p>
        {evidence.confidenceFactors.map((f) => (
          <div key={f.name} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>{f.name}</span>
              <span className="text-muted-foreground tabular-nums">{num(f.score * 100, 0)} %</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${f.score * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{f.detail}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Prioridad: rango {p.band.min}–{p.band.max} por tipo y severidad; dentro del rango pesan la
        magnitud ({num(p.magnitude * 100, 0)} %), el riesgo ({num(p.risk * 100, 0)} %) y si sigue
        activo ({p.ongoing ? 'sí' : 'no'}).
      </p>
    </div>
  );
}

const NEXT_ACTIONS: Record<
  AnomalyStatus,
  {
    status: AnomalyStatus;
    label: string;
    icon: typeof PlayCircle;
    variant: 'default' | 'outline';
  }[]
> = {
  OPEN: [
    { status: 'IN_PROGRESS', label: 'Iniciar investigación', icon: PlayCircle, variant: 'default' },
    { status: 'RESOLVED', label: 'Resolver', icon: CheckCircle2, variant: 'outline' },
    { status: 'DISMISSED', label: 'Descartar', icon: XCircle, variant: 'outline' },
  ],
  IN_PROGRESS: [
    { status: 'RESOLVED', label: 'Resolver', icon: CheckCircle2, variant: 'default' },
    { status: 'DISMISSED', label: 'Descartar', icon: XCircle, variant: 'outline' },
  ],
  RESOLVED: [{ status: 'OPEN', label: 'Reabrir', icon: RotateCcw, variant: 'outline' }],
  DISMISSED: [{ status: 'OPEN', label: 'Reabrir', icon: RotateCcw, variant: 'outline' }],
};

function ActionPanel({ anomaly }: { anomaly: AnomalyDetail }) {
  const [note, setNote] = useState('');
  const update = useUpdateAnomaly(anomaly.id);

  const apply = (status: AnomalyStatus) =>
    update.mutate(
      { status, note: note.trim() || undefined },
      {
        onSuccess: () => {
          setNote('');
          toast.success(`Anomalía de ${anomaly.meterId}: ${ANOMALY_STATUS[status].toLowerCase()}`);
        },
        onError: (err) => toast.error(err.message),
      },
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        Estado actual: <AnomalyStatusBadge status={anomaly.status} />
      </div>
      <Textarea
        placeholder="Nota (opcional): qué se hizo o qué se encontró"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
      />
      <div className="flex flex-wrap gap-2">
        {NEXT_ACTIONS[anomaly.status].map(({ status, label, icon: Icon, variant }) => (
          <Button
            key={status}
            variant={variant}
            size="sm"
            disabled={update.isPending}
            onClick={() => apply(status)}
            className="gap-1.5"
          >
            {update.isPending && update.variables?.status === status ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Icon />
            )}
            {label}
          </Button>
        ))}
      </div>
      {anomaly.actions.length > 0 && (
        <ol className="space-y-3 border-t pt-4">
          {[...anomaly.actions].reverse().map((a) => (
            <li key={a.id} className="space-y-0.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <AnomalyStatusBadge status={a.status} />
                <span className="text-xs text-muted-foreground">
                  {a.user ?? 'Sistema'} · {dateTime(a.createdAt)}
                </span>
              </div>
              {a.note && <p className="text-muted-foreground">{a.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function InvestigationPage() {
  const { id = '' } = useParams();
  const anomaly = useAnomaly(id);
  const meterId = anomaly.data?.meterId ?? '';
  const meter = useMeter(meterId);
  const readings = useReadings(meterId);
  const evidence = anomaly.data?.evidence as unknown as Evidence | undefined;

  const windows = useMemo(
    () =>
      anomaly.data
        ? [
            {
              windowStart: anomaly.data.windowStart,
              windowEnd: anomaly.data.windowEnd,
              type: anomaly.data.type,
            },
          ]
        : [],
    [anomaly.data],
  );
  const focus = useMemo(
    () =>
      anomaly.data ? { start: anomaly.data.windowStart, end: anomaly.data.windowEnd } : undefined,
    [anomaly.data],
  );

  if (anomaly.isLoading) return <LoadingBlock className="h-96" />;
  if (anomaly.error || !anomaly.data || !evidence) {
    return <ErrorState error={anomaly.error} onRetry={() => anomaly.refetch()} />;
  }
  const a = anomaly.data;
  const w = evidence.window;
  const fromLlm = a.insight.source === 'LLM';

  return (
    <>
      <Link
        to="/anomalies"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Anomalías IA
      </Link>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            <Link to={`/meters/${a.meterId}`} className="hover:underline">
              {a.meterId}
            </Link>{' '}
            <span className="font-normal text-muted-foreground">· {a.meterName}</span>
          </h1>
          <AnomalyTypeBadge type={a.type} />
          <SeverityBadge severity={a.severity} />
          <AnomalyStatusBadge status={a.status} />
        </div>
        <p className="text-lg">{a.reason}</p>
        <p className="text-sm text-muted-foreground">
          {ANOMALY_TYPE_HINT[a.type]} Ventana: {dateTime(w.start)} →{' '}
          {w.ongoing ? 'sigue activa' : dateTime(w.end)} ({w.durationHours} h).
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section
            title="Qué encontró la IA"
            description={
              <span className="inline-flex items-center gap-1.5">
                {fromLlm ? <Bot className="size-3.5" /> : <FileText className="size-3.5" />}
                {fromLlm
                  ? `Redactado por IA local (${a.insight.model?.replace('ollama:', '')}) a partir de la evidencia del motor`
                  : 'Generado con plantilla a partir de la evidencia del motor'}
              </span>
            }
          >
            <p className="leading-relaxed">{a.explanation}</p>
            {a.insight.fallbackReason && (
              <p className="mt-3 text-xs text-muted-foreground">
                Se usó la plantilla porque{' '}
                {a.insight.fallbackReason.charAt(0).toLowerCase() +
                  a.insight.fallbackReason.slice(1)}
                .
              </p>
            )}
          </Section>

          <Section
            title="Comparación contra baseline"
            description="Consumo horario (línea continua) frente a lo esperado para cada hora (discontinua). La zona sombreada es la ventana de la anomalía."
          >
            {readings.data && meter.data ? (
              <MeterSeriesChart
                readings={readings.data}
                profile={meter.data.baselineProfile}
                windows={windows}
                events={meter.data.events}
                focus={focus}
              />
            ) : (
              <LoadingBlock className="h-80" />
            )}
          </Section>

          <Section
            title="Variables que cambiaron"
            description="Lo que el motor comparó contra el comportamiento normal del medidor."
          >
            <ChangedVariables evidence={evidence} />
          </Section>

          <Section
            title="Eventos relacionados"
            description="Eventos operativos cercanos y si explican o no el cambio."
          >
            <RelatedEvents evidence={evidence} />
          </Section>

          <details className="rounded-xl border bg-card p-4 text-sm">
            <summary className="cursor-pointer font-medium">Evidencia completa (JSON)</summary>
            <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs">
              {JSON.stringify(evidence, null, 2)}
            </pre>
          </details>
        </div>

        <div className="space-y-6">
          <Section title="Acción recomendada" className="border-primary/30 ring-primary/20">
            <p className="text-lg font-semibold text-primary">{a.recommendedAction}</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
              {a.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </Section>

          <Section title="Acción" description="Registra qué se hizo con esta anomalía.">
            <ActionPanel anomaly={a} />
          </Section>

          <Section title="Severidad y confianza">
            <ConfidenceBreakdown anomaly={a} evidence={evidence} />
          </Section>
        </div>
      </div>
    </>
  );
}

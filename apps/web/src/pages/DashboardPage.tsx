import { Link } from 'react-router';
import {
  Activity,
  AlertOctagon,
  ArrowRight,
  BrainCircuit,
  Clock,
  Gauge,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useAnalysisPanel } from '@/components/analysis/context';
import { DailyConsumptionChart } from '@/components/charts/DailyConsumptionChart';
import { ErrorState, KpiCard, LoadingBlock, PageHeader } from '@/components/common';
import { MetersTable } from '@/components/MetersTable';
import { AnomalyTypeBadge, Confidence, SeverityBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboard, useMeters } from '@/hooks/api';
import { confidencePct, dateTime, energy, shortDate, timeAgo } from '@/lib/format';

export function DashboardPage() {
  const { data, error, refetch, isLoading } = useDashboard();
  const meters = useMeters({ sort: 'severity', order: 'desc' });
  const { run } = useAnalysisPanel();

  if (isLoading) return <LoadingBlock className="h-96" />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;

  const { meters: m, consumption, anomalies, lastAnalysis } = data;
  const analyzed = lastAnalysis?.status === 'COMPLETED';

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          consumption.periodStart && consumption.periodEnd
            ? `${m.total} medidores · ${shortDate(consumption.periodStart)} – ${shortDate(consumption.periodEnd)} ${new Date(consumption.periodEnd).getUTCFullYear()} · horas en UTC`
            : undefined
        }
      />

      {!lastAnalysis && (
        <Card className="border-primary/30 bg-accent/60">
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-3">
              <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">
                  Ejecuta el análisis IA para saber qué requiere atención
                </p>
                <p className="text-sm text-muted-foreground">
                  Calcula el comportamiento esperado de cada medidor, detecta anomalías, las cruza
                  con los eventos operativos y explica cada hallazgo.
                </p>
              </div>
            </div>
            <Button onClick={run} className="gap-2">
              <Sparkles className="size-4" /> Run AI Analysis
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Medidores"
          icon={Gauge}
          value={m.total}
          hint={`${m.byStatus.OK} normales · ${m.byStatus.ALERT} alerta · ${m.byStatus.CRITICAL} crítico`}
        />
        <KpiCard
          label="Consumo del periodo"
          icon={Zap}
          value={energy(consumption.totalKwh)}
          hint="Todos los medidores, 14 días"
        />
        <KpiCard
          label="Anomalías IA"
          icon={BrainCircuit}
          tone="primary"
          value={analyzed ? anomalies.detected : '—'}
          hint={analyzed ? 'Detectadas en el último análisis' : 'Sin análisis'}
        />
        <KpiCard
          label="Alta prioridad"
          icon={AlertOctagon}
          tone={anomalies.highPriority > 0 ? 'critical' : 'default'}
          value={analyzed ? anomalies.highPriority : '—'}
          hint="Severidad alta y sin resolver"
        />
        <KpiCard
          label="Confianza IA"
          icon={ShieldCheck}
          value={
            anomalies.averageConfidence !== null ? confidencePct(anomalies.averageConfidence) : '—'
          }
          hint="Promedio de los hallazgos"
        />
        <KpiCard
          label="Último análisis"
          icon={Clock}
          value={
            lastAnalysis?.finishedAt ? (
              <span className="text-lg">{timeAgo(lastAnalysis.finishedAt)}</span>
            ) : (
              <span className="text-lg">{lastAnalysis ? 'En curso…' : 'Nunca'}</span>
            )
          }
          hint={
            lastAnalysis?.finishedAt
              ? `${dateTime(lastAnalysis.finishedAt)} · ${lastAnalysis.status === 'COMPLETED' ? 'Completado' : 'Falló'}`
              : 'Pulsa Run AI Analysis'
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Requieren atención</CardTitle>
            <CardDescription>Anomalías activas, de mayor a menor prioridad.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!analyzed && (
              <p className="text-sm text-muted-foreground">
                Aparecerán aquí después del primer análisis.
              </p>
            )}
            {analyzed && anomalies.top.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay anomalías activas.</p>
            )}
            {anomalies.top.map((a, i) => (
              <Link
                key={a.id}
                to={`/anomalies/${a.id}`}
                className="group flex items-start gap-4 rounded-xl border p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{a.meterId}</span>
                    <span className="text-sm text-muted-foreground">{a.meterName}</span>
                    <AnomalyTypeBadge type={a.type} />
                    <SeverityBadge severity={a.severity} />
                  </div>
                  <p className="text-sm">{a.reason}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      Acción:{' '}
                      <span className="font-medium text-foreground">{a.recommendedAction}</span>
                    </span>
                    <Confidence value={a.confidence} />
                  </div>
                </div>
                <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4 text-primary" /> Consumo diario
            </CardTitle>
            <CardDescription>Todos los medidores, en kWh.</CardDescription>
          </CardHeader>
          <CardContent>
            <DailyConsumptionChart daily={consumption.daily} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle>Medidores</CardTitle>
            <CardDescription>Ordenados por severidad.</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/meters">Ver todos</Link>
          </Button>
        </CardHeader>
        <CardContent className="px-0">
          <MetersTable meters={(meters.data ?? []).slice(0, 6)} />
        </CardContent>
      </Card>
    </>
  );
}

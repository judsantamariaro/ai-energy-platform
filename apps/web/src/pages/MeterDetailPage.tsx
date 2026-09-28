import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Gauge,
  Info,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useAnalysisPanel } from '@/components/analysis/context';
import { MeterSeriesChart, type Metric } from '@/components/charts/MeterSeriesChart';
import { ErrorState, KpiCard, LoadingBlock, PageHeader } from '@/components/common';
import {
  AnomalyStatusBadge,
  AnomalyTypeBadge,
  MeterStatusBadge,
  SeverityBadge,
  Variation,
} from '@/components/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAnomalies, useMeter, useReadings } from '@/hooks/api';
import { dateTime, kwh, pct } from '@/lib/format';

const METRIC_LABELS: Record<Metric, string> = {
  consumption: 'Consumo',
  voltage: 'Voltaje',
  powerFactor: 'Factor de potencia',
  current: 'Corriente',
};

export function MeterDetailPage() {
  const { meterId = '' } = useParams();
  const meter = useMeter(meterId);
  const readings = useReadings(meterId);
  const anomalies = useAnomalies({ meterId });
  const { run } = useAnalysisPanel();
  const [metric, setMetric] = useState<Metric>('consumption');

  const windows = useMemo(
    () =>
      (anomalies.data ?? []).map((a) => ({
        windowStart: a.windowStart,
        windowEnd: a.windowEnd,
        type: a.type,
      })),
    [anomalies.data],
  );

  if (meter.isLoading) return <LoadingBlock className="h-96" />;
  if (meter.error || !meter.data)
    return <ErrorState error={meter.error} onRetry={() => meter.refetch()} />;
  const m = meter.data;
  const top = anomalies.data?.[0];

  return (
    <>
      <Link
        to="/meters"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Medidores
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {m.meterId}
            <span className="text-lg font-normal text-muted-foreground">{m.name}</span>
            <MeterStatusBadge status={m.status} />
          </span>
        }
        description={m.location}
        actions={
          top && (
            <Button asChild className="gap-2">
              <Link to={`/anomalies/${top.id}`}>
                Investigar anomalía <ArrowRight className="size-4" />
              </Link>
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Consumo actual (24 h)"
          icon={Zap}
          value={m.current ? kwh(m.current.consumptionKwh) : '—'}
          hint="Últimas 24 horas de datos"
        />
        <KpiCard
          label="Baseline (24 h)"
          icon={Gauge}
          value={m.current ? kwh(m.current.baselineKwh) : '—'}
          hint={
            m.baselineDayKwh ? `Día típico: ${kwh(m.baselineDayKwh)}` : 'Se calcula con el análisis'
          }
        />
        <KpiCard
          label="Variación"
          icon={TrendingUp}
          tone={m.current && Math.abs(m.current.variation) > 0.25 ? 'critical' : 'default'}
          value={
            m.current ? (
              <Variation value={m.current.variation}>{pct(m.current.variation)}</Variation>
            ) : (
              '—'
            )
          }
          hint="Consumo actual frente al baseline"
        />
        <KpiCard
          label="Consumo del periodo"
          icon={Activity}
          value={kwh(m.periodConsumptionKwh)}
          hint={`${m.readings} lecturas horarias`}
        />
      </div>

      {!m.baselineProfile && (
        <Card className="bg-accent/50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <Info className="size-4 text-primary" />
              El baseline y las anomalías se calculan al ejecutar el análisis IA.
            </span>
            <Button size="sm" onClick={run}>
              Run AI Analysis
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Histórico horario</CardTitle>
            <CardDescription>
              Línea discontinua: valor esperado por el baseline. Zona sombreada: ventana de la
              anomalía. Líneas verticales: eventos operativos.
            </CardDescription>
          </div>
          <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <TabsList>
              {(Object.keys(METRIC_LABELS) as Metric[]).map((k) => (
                <TabsTrigger key={k} value={k}>
                  {METRIC_LABELS[k]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {readings.data ? (
            <MeterSeriesChart
              readings={readings.data}
              profile={m.baselineProfile}
              windows={windows}
              events={m.events}
              metric={metric}
            />
          ) : (
            <LoadingBlock className="h-80" />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Anomalías del medidor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(anomalies.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Sin anomalías en el último análisis.</p>
            )}
            {anomalies.data?.map((a) => (
              <Link
                key={a.id}
                to={`/anomalies/${a.id}`}
                className="flex items-start justify-between gap-3 rounded-xl border p-4 hover:border-primary/40 hover:bg-accent/40"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <AnomalyTypeBadge type={a.type} />
                    <SeverityBadge severity={a.severity} />
                    <AnomalyStatusBadge status={a.status} />
                  </div>
                  <p className="text-sm">{a.reason}</p>
                  <p className="text-xs text-muted-foreground">Desde {dateTime(a.windowStart)}</p>
                </div>
                <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Eventos registrados</CardTitle>
            <CardDescription>Del archivo de eventos operativos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {m.events.length === 0 && <p className="text-sm text-muted-foreground">Sin eventos.</p>}
            {m.events.map((e) => (
              <div key={e.id} className="flex gap-3 rounded-xl border p-4">
                <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">{e.type}</div>
                  <div className="text-sm text-muted-foreground">
                    {e.description || 'Sin descripción'}
                  </div>
                  <div className="text-xs text-muted-foreground">{dateTime(e.timestamp)}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

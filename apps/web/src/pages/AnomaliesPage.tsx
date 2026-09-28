import { Link, useNavigate, useSearchParams } from 'react-router';
import { BrainCircuit, ChevronRight, Sparkles } from 'lucide-react';
import type { AnomalyStatus, AnomalyType, Severity } from '@aiem/shared';
import { useAnalysisPanel } from '@/components/analysis/context';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/common';
import {
  AnomalyStatusBadge,
  AnomalyTypeBadge,
  Confidence,
  SeverityBadge,
} from '@/components/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAnomalies, useLatestAnalysis } from '@/hooks/api';
import { shortDateTime } from '@/lib/format';
import { ANOMALY_STATUS, ANOMALY_TYPE, SEVERITY } from '@/lib/labels';

const ALL = 'ALL';

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: Record<T, string>;
  onChange: (value: T | undefined) => void;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : (v as T))}>
      <SelectTrigger className="w-44" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: todos</SelectItem>
        {(Object.entries(options) as [T, string][]).map(([k, v]) => (
          <SelectItem key={k} value={k}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Barra de prioridad (0–100). */
function Priority({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2" title={`Prioridad ${value} de 100`}>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <div
          className={
            value >= 75
              ? 'h-full bg-critical'
              : value >= 45
                ? 'h-full bg-alert'
                : 'h-full bg-muted-foreground/40'
          }
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{Math.round(value)}</span>
    </div>
  );
}

export function AnomaliesPage() {
  const [params, setParams] = useSearchParams();
  const type = (params.get('type') as AnomalyType | null) ?? undefined;
  const severity = (params.get('severity') as Severity | null) ?? undefined;
  const status = (params.get('status') as AnomalyStatus | null) ?? undefined;
  const anomalies = useAnomalies({ type, severity, status });
  const { data: run } = useLatestAnalysis();
  const panel = useAnalysisPanel();
  const navigate = useNavigate();

  const set = (key: string) => (value: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  return (
    <>
      <PageHeader
        title="Anomalías IA"
        description="Hallazgos del último análisis, ordenados por prioridad: qué investigar primero y qué acción tomar."
        actions={
          <>
            <FilterSelect label="Tipo" value={type} options={ANOMALY_TYPE} onChange={set('type')} />
            <FilterSelect
              label="Severidad"
              value={severity}
              options={SEVERITY}
              onChange={set('severity')}
            />
            <FilterSelect
              label="Estado"
              value={status}
              options={ANOMALY_STATUS}
              onChange={set('status')}
            />
          </>
        }
      />

      <Card>
        <CardContent className="px-0">
          {anomalies.isLoading ? (
            <LoadingBlock className="mx-6 w-auto" />
          ) : anomalies.error ? (
            <ErrorState error={anomalies.error} onRetry={() => anomalies.refetch()} />
          ) : anomalies.data?.length === 0 ? (
            <div className="px-6">
              {run?.status === 'COMPLETED' ? (
                <EmptyState icon={BrainCircuit} title="Ninguna anomalía coincide con los filtros" />
              ) : (
                <EmptyState
                  icon={Sparkles}
                  title="Aún no hay anomalías"
                  description="Ejecuta el análisis IA para detectar, explicar y priorizar las anomalías de los medidores."
                  action={<Button onClick={panel.run}>Run AI Analysis</Button>}
                />
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Prioridad</TableHead>
                  <TableHead>Medidor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Severidad</TableHead>
                  <TableHead>Confianza</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Desde</TableHead>
                  <TableHead className="w-8 pr-6" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {anomalies.data?.map((a) => (
                  <TableRow
                    key={a.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/anomalies/${a.id}`)}
                  >
                    <TableCell className="pl-6">
                      <Priority value={a.priorityScore} />
                    </TableCell>
                    <TableCell className="max-w-56">
                      <Link
                        to={`/anomalies/${a.id}`}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Investigar la anomalía de ${a.meterId}`}
                        className="block font-semibold hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {a.meterId}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground" title={a.reason}>
                        {a.reason}
                      </div>
                    </TableCell>
                    <TableCell>
                      <AnomalyTypeBadge type={a.type} />
                    </TableCell>
                    <TableCell>
                      <SeverityBadge severity={a.severity} />
                    </TableCell>
                    <TableCell>
                      <Confidence value={a.confidence} />
                    </TableCell>
                    <TableCell className="max-w-44 font-medium whitespace-normal">
                      {a.recommendedAction}
                    </TableCell>
                    <TableCell>
                      <AnomalyStatusBadge status={a.status} />
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
                      {shortDateTime(a.windowStart)}
                    </TableCell>
                    <TableCell className="pr-6">
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

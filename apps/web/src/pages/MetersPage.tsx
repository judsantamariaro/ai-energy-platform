import { useSearchParams } from 'react-router';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Search } from 'lucide-react';
import type { MeterSort, MeterStatus } from '@aiem/shared';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/common';
import { MetersTable } from '@/components/MetersTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useMeters } from '@/hooks/api';

const STATUS_FILTERS: { value: MeterStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'OK', label: 'Normales' },
  { value: 'ALERT', label: 'Alertas' },
  { value: 'CRITICAL', label: 'Críticos' },
];

const SORTS: { value: MeterSort; label: string }[] = [
  { value: 'meterId', label: 'Medidor' },
  { value: 'consumption', label: 'Consumo' },
  { value: 'variation', label: 'Variación' },
  { value: 'severity', label: 'Severidad' },
];

export function MetersPage() {
  // Los filtros viven en la URL: se pueden compartir y sobreviven a recargar la página.
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as MeterStatus | null) ?? undefined;
  const search = params.get('search') ?? '';
  const sort = (params.get('sort') as MeterSort | null) ?? 'severity';
  const order = (params.get('order') as 'asc' | 'desc' | null) ?? 'desc';

  const all = useMeters({});
  const meters = useMeters({ status, search, sort, order });

  const update = (changes: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );

  const count = (value: MeterStatus | 'ALL') =>
    value === 'ALL' ? all.data?.length : all.data?.filter((m) => m.status === value).length;

  return (
    <>
      <PageHeader
        title="Medidores"
        description="Consumo de las últimas 24 horas frente a lo esperado según el baseline de cada medidor."
      />

      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={status ?? 'ALL'}
          onValueChange={(v) => v && update({ status: v === 'ALL' ? undefined : v })}
        >
          {STATUS_FILTERS.map((f) => (
            <ToggleGroupItem
              key={f.value}
              value={f.value}
              className="gap-1.5 px-3 data-[state=on]:border-primary/40 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
            >
              {f.label}
              <span className="text-xs text-muted-foreground tabular-nums">
                {count(f.value) ?? ''}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por meter_id o nombre"
            className="pl-8"
            value={search}
            onChange={(e) => update({ search: e.target.value })}
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Ordenar por</span>
          <Select value={sort} onValueChange={(v) => update({ sort: v })}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            title={order === 'desc' ? 'Mayor a menor' : 'Menor a mayor'}
            onClick={() => update({ order: order === 'desc' ? 'asc' : 'desc' })}
          >
            {order === 'desc' ? <ArrowDownWideNarrow /> : <ArrowUpNarrowWide />}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="px-0">
          {meters.isLoading ? (
            <LoadingBlock className="mx-6 w-auto" />
          ) : meters.error ? (
            <ErrorState error={meters.error} onRetry={() => meters.refetch()} />
          ) : meters.data?.length === 0 ? (
            <div className="px-6">
              <EmptyState title="Ningún medidor coincide con los filtros" />
            </div>
          ) : (
            <MetersTable meters={meters.data ?? []} />
          )}
        </CardContent>
      </Card>
    </>
  );
}

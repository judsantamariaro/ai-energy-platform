import { useNavigate } from 'react-router';
import { ChevronRight } from 'lucide-react';
import type { MeterListItem } from '@aiem/shared';
import { AnomalyTypeBadge, MeterStatusBadge, SeverityBadge, Variation } from '@/components/status';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { kwh, pct } from '@/lib/format';

/** Tabla de medidores: consumo de las últimas 24 h frente al baseline (A8). */
export function MetersTable({ meters }: { meters: MeterListItem[] }) {
  const navigate = useNavigate();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-6">Medidor</TableHead>
          <TableHead className="text-right">Consumo 24 h</TableHead>
          <TableHead className="text-right">Baseline 24 h</TableHead>
          <TableHead className="text-right">Variación</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Anomalía</TableHead>
          <TableHead className="w-8 pr-6" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {meters.map((m) => (
          <TableRow
            key={m.meterId}
            className="cursor-pointer"
            onClick={() => navigate(`/meters/${m.meterId}`)}
          >
            <TableCell className="pl-6">
              <div className="font-semibold">{m.meterId}</div>
              <div className="text-xs text-muted-foreground">
                {m.name}
                {m.location && ` · ${m.location}`}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {m.current ? kwh(m.current.consumptionKwh) : '—'}
            </TableCell>
            <TableCell className="text-right text-muted-foreground tabular-nums">
              {m.current ? kwh(m.current.baselineKwh) : '—'}
            </TableCell>
            <TableCell className="text-right">
              {m.current ? (
                <Variation value={m.current.variation}>{pct(m.current.variation)}</Variation>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              <MeterStatusBadge status={m.status} />
            </TableCell>
            <TableCell>
              {m.topAnomaly ? (
                <div className="flex items-center gap-1.5">
                  <AnomalyTypeBadge type={m.topAnomaly.type} />
                  <SeverityBadge severity={m.topAnomaly.severity} />
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="pr-6">
              <ChevronRight className="size-4 text-muted-foreground" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

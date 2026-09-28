import type { AnomalyStatus, AnomalyType, MeterStatus, Severity } from '@aiem/shared';
import { cn } from '@/lib/utils';
import {
  ANOMALY_STATUS,
  ANOMALY_TYPE,
  ANOMALY_TYPE_HINT,
  confidenceLevel,
  METER_STATUS,
  SEVERITY,
} from '@/lib/labels';
import { confidencePct } from '@/lib/format';
import {
  ANOMALY_STATUS_TONE,
  METER_TONE,
  SEVERITY_TONE,
  TONE,
  TYPE_TONE,
  type Tone,
} from '@/lib/tones';

export function Pill({
  tone,
  children,
  className,
  title,
  dot = false,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
  title?: string;
  dot?: boolean;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        TONE[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const MeterStatusBadge = ({ status }: { status: MeterStatus }) => (
  <Pill tone={METER_TONE[status]} dot>
    {METER_STATUS[status]}
  </Pill>
);

export const SeverityBadge = ({ severity }: { severity: Severity }) => (
  <Pill tone={SEVERITY_TONE[severity]}>{SEVERITY[severity]}</Pill>
);

export const AnomalyTypeBadge = ({ type }: { type: AnomalyType }) => (
  <Pill tone={TYPE_TONE[type]} title={ANOMALY_TYPE_HINT[type]}>
    {ANOMALY_TYPE[type]}
  </Pill>
);

export const AnomalyStatusBadge = ({ status }: { status: AnomalyStatus }) => (
  <Pill tone={ANOMALY_STATUS_TONE[status]} dot>
    {ANOMALY_STATUS[status]}
  </Pill>
);

/** "Alta · 97 %", como la columna Confianza del enunciado. */
export function Confidence({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('text-sm whitespace-nowrap', className)}>
      <span className="font-medium">{confidenceLevel(value)}</span>
      <span className="text-muted-foreground"> · {confidencePct(value)}</span>
    </span>
  );
}

/** Variación con color: rojo si sube mucho, ámbar si baja mucho. */
export function Variation({ value, children }: { value: number; children: React.ReactNode }) {
  const tone =
    value > 0.25
      ? 'text-critical'
      : value < -0.25
        ? 'text-[oklch(0.5_0.12_60)]'
        : 'text-muted-foreground';
  return <span className={cn('font-medium tabular-nums', tone)}>{children}</span>;
}

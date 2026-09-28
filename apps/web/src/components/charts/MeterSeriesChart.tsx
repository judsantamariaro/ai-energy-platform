import { useMemo } from 'react';
import type { AnomalyType, MeterDetail, Reading } from '@aiem/shared';
import { EChart, type EChartOption } from './EChart';
import { ANOMALY_COLOR, CHART, numberFormat } from './palette';
import { ANOMALY_TYPE } from '@/lib/labels';
import { shortDateTime } from '@/lib/format';

export type Metric = 'consumption' | 'voltage' | 'powerFactor' | 'current';

const METRICS: Record<
  Metric,
  {
    label: string;
    unit: string;
    color: string;
    value: (r: Reading) => number | null;
    profile?: keyof NonNullable<MeterDetail['baselineProfile']>;
  }
> = {
  consumption: {
    label: 'Consumo',
    unit: 'kWh',
    color: CHART.consumption,
    value: (r) => r.consumptionKwh,
    profile: 'kwh',
  },
  voltage: {
    label: 'Voltaje',
    unit: 'V',
    color: CHART.voltage,
    value: (r) => r.voltageV,
    profile: 'voltage',
  },
  powerFactor: {
    label: 'Factor de potencia',
    unit: '',
    color: CHART.powerFactor,
    value: (r) => r.powerFactor,
    profile: 'powerFactor',
  },
  current: { label: 'Corriente', unit: 'A', color: CHART.current, value: (r) => r.currentA },
};

export interface ChartWindow {
  windowStart: string;
  windowEnd: string | null;
  type: AnomalyType;
}

const HOUR = 3_600_000;

/**
 * Serie horaria de una variable con su baseline (valor esperado para cada hora), las ventanas de
 * las anomalías sombreadas y los eventos operativos como líneas verticales.
 */
export function MeterSeriesChart({
  readings,
  profile,
  windows = [],
  events = [],
  metric = 'consumption',
  focus,
  className,
}: {
  readings: Reading[];
  profile: MeterDetail['baselineProfile'];
  windows?: ChartWindow[];
  events?: { timestamp: string; type: string }[];
  metric?: Metric;
  /** Ventana a la que se hace zoom al abrir (con un día de margen a cada lado). */
  focus?: { start: string; end: string | null } | undefined;
  className?: string;
}) {
  const option = useMemo<EChartOption>(() => {
    const m = METRICS[metric];
    const expected = m.profile && profile ? profile[m.profile] : null;
    const unit = m.unit ? ` ${m.unit}` : '';
    const first = readings[0] ? Date.parse(readings[0].timestamp) : 0;
    const last = readings.at(-1) ? Date.parse(readings.at(-1)!.timestamp) : 0;

    const zoom = focus
      ? {
          startValue: Math.max(first, Date.parse(focus.start) - 24 * HOUR),
          endValue: Math.min(last, (focus.end ? Date.parse(focus.end) : last) + 24 * HOUR),
        }
      : {};

    return {
      // Marcas del eje en UTC, igual que las etiquetas (ADR 0004).
      useUTC: true,
      animation: false,
      grid: { left: 8, right: 16, top: 40, bottom: 56, containLabel: true },
      legend: { top: 0, left: 0, textStyle: { color: CHART.axis }, itemWidth: 16, itemHeight: 8 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        formatter: (
          params: {
            axisValue: number;
            seriesName: string;
            value: [number, number | null];
            color: string;
          }[],
        ) => {
          const time = params[0] ? shortDateTime(new Date(params[0].axisValue).toISOString()) : '';
          const rows = params
            .filter((p) => p.value[1] !== null && p.value[1] !== undefined)
            .map(
              (p) =>
                `<div style="display:flex;justify-content:space-between;gap:16px"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:6px"></span>${p.seriesName}</span><b>${numberFormat.format(p.value[1]!)}${unit}</b></div>`,
            )
            .join('');
          return `<div style="font-size:12px"><div style="margin-bottom:4px;color:${CHART.axis}">${time} UTC</div>${rows}</div>`;
        },
      },
      xAxis: {
        type: 'time',
        axisLabel: {
          color: CHART.axis,
          formatter: (v: number) => shortDateTime(new Date(v).toISOString()).replace(' ', '\n'),
        },
        axisLine: { lineStyle: { color: CHART.grid } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        scale: metric !== 'consumption',
        axisLabel: { color: CHART.axis },
        splitLine: { lineStyle: { color: CHART.grid } },
      },
      dataZoom: [
        { type: 'inside', ...zoom },
        { type: 'slider', height: 18, bottom: 8, borderColor: CHART.grid, ...zoom },
      ],
      series: [
        {
          name: m.label,
          type: 'line',
          showSymbol: false,
          data: readings.map((r) => [Date.parse(r.timestamp), m.value(r)]),
          lineStyle: { color: m.color, width: 1.6 },
          itemStyle: { color: m.color },
          markArea: {
            silent: true,
            data: windows.map((w) => [
              {
                name: ANOMALY_TYPE[w.type],
                xAxis: Date.parse(w.windowStart),
                itemStyle: { color: ANOMALY_COLOR[w.type], opacity: 0.1 },
                label: { color: ANOMALY_COLOR[w.type], fontSize: 11, position: 'insideTop' },
              },
              { xAxis: (w.windowEnd ? Date.parse(w.windowEnd) : last) + HOUR },
            ]),
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: CHART.axis, type: 'dashed', width: 1 },
            label: { formatter: '{b}', color: CHART.axis, fontSize: 10, position: 'insideEndTop' },
            data: events.map((e) => ({ name: e.type, xAxis: Date.parse(e.timestamp) })),
          },
        },
        ...(expected
          ? [
              {
                name: 'Baseline (esperado)',
                type: 'line',
                showSymbol: false,
                data: readings.map((r) => [
                  Date.parse(r.timestamp),
                  expected[new Date(r.timestamp).getUTCHours()] ?? null,
                ]),
                lineStyle: { color: CHART.baseline, width: 1.4, type: 'dashed' },
                itemStyle: { color: CHART.baseline },
              },
            ]
          : []),
      ],
    };
  }, [readings, profile, windows, events, metric, focus]);

  return <EChart option={option} className={className ?? 'h-80'} />;
}

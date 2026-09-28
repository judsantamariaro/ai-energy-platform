import { useMemo } from 'react';
import { EChart, type EChartOption } from './EChart';
import { CHART, numberFormat } from './palette';
import { shortDate } from '@/lib/format';

/** Consumo total de todos los medidores por día. */
export function DailyConsumptionChart({ daily }: { daily: { date: string; kwh: number }[] }) {
  const option = useMemo<EChartOption>(
    () => ({
      grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: number) => `${numberFormat.format(v)} kWh`,
      },
      xAxis: {
        type: 'category',
        data: daily.map((d) => shortDate(`${d.date}T00:00:00Z`)),
        axisLine: { lineStyle: { color: CHART.grid } },
        axisLabel: { color: CHART.axis },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: CHART.axis,
          formatter: (v: number) => numberFormat.format(v / 1000) + 'k',
        },
        splitLine: { lineStyle: { color: CHART.grid } },
      },
      series: [
        {
          name: 'Consumo',
          type: 'bar',
          data: daily.map((d) => d.kwh),
          itemStyle: { color: CHART.consumption, borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 28,
        },
      ],
    }),
    [daily],
  );
  return <EChart option={option} className="h-64" />;
}

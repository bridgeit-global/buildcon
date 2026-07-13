'use client';

import { useEffect, useRef } from 'react';
import type { ChartOptions } from 'chart.js';
import { useTheme } from '@/components/theme-provider';
import type { MonthPoint, SalesVsCollPoint, UnitStatusSlice } from './dashboard-utils';
import {
  CHART_DEFAULTS,
  chartSegmentColor,
  getDashboardChartColors,
  type DashboardChartColors
} from './dashboard-theme';

const CHART_HEIGHT = 220;

function scaleOptions(colors: DashboardChartColors) {
  return {
    y: {
      ticks: {
        font: CHART_DEFAULTS.font,
        color: colors.tick,
        maxTicksLimit: 6
      },
      grid: { color: colors.grid },
      border: { display: false }
    },
    x: {
      ticks: {
        font: CHART_DEFAULTS.font,
        color: colors.tick,
        maxRotation: 0,
        autoSkip: true,
        maxTicksLimit: 8
      },
      grid: { display: false },
      border: { display: false }
    }
  } satisfies ChartOptions['scales'];
}

function legendOptions(
  colors: DashboardChartColors,
  position: 'bottom' | 'right' = 'bottom'
) {
  return {
    position,
    align: 'start' as const,
    labels: {
      font: CHART_DEFAULTS.font,
      color: colors.legend,
      boxWidth: 8,
      boxHeight: 8,
      usePointStyle: true,
      pointStyle: 'circle' as const,
      padding: 14
    }
  };
}

function unitCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'unit' : 'units'}`;
}

function segmentColorsForBreakdown(
  breakdown: UnitStatusSlice[],
  palette: DashboardChartColors
): string[] {
  let tealIndex = 0;
  return breakdown.map((slice) => {
    if (slice.muted) return palette.segmentMuted;
    return chartSegmentColor(tealIndex++, palette);
  });
}

export function InventoryDonutChart({ breakdown }: { breakdown: UnitStatusSlice[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import('chart.js').Chart | null>(null);
  const { brand, mode } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;

    void (async () => {
      const { Chart } = await import('chart.js/auto');
      if (cancelled) return;

      const chartColors = getDashboardChartColors();
      chartRef.current?.destroy();

      if (!breakdown.length) {
        chartRef.current = new Chart(canvas, {
          type: 'doughnut',
          data: {
            labels: ['No units'],
            datasets: [
              {
                data: [1],
                backgroundColor: [chartColors.grid],
                borderWidth: 0
              }
            ]
          },
          options: {
            cutout: '62%',
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            animation: { duration: 0 }
          }
        });
        return;
      }

      const labels = breakdown.map(
        (s) => `${s.label} (${unitCountLabel(s.count)})`
      );
      const data = breakdown.map((s) => s.count);
      const colors = segmentColorsForBreakdown(breakdown, chartColors);
      const legend = legendOptions(chartColors, 'bottom');

      chartRef.current = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{ data, backgroundColor: colors, borderWidth: 0, spacing: 2 }]
        },
        options: {
          cutout: '62%',
          maintainAspectRatio: false,
          plugins: {
            legend: {
              ...legend,
              labels: {
                ...legend.labels,
                padding: breakdown.length > 5 ? 10 : 14
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const slice = breakdown[ctx.dataIndex];
                  if (!slice) return '';
                  return `${slice.label}: ${unitCountLabel(slice.count)}`;
                }
              }
            }
          },
          animation: { duration: 600 }
        }
      });
    })();

    return () => {
      cancelled = true;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [breakdown, brand, mode]);

  return (
    <div
      className="w-full"
      style={{ height: breakdown.length > 5 ? 280 : CHART_HEIGHT }}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

export function MonthlyCollectionsBarChart({ points }: { points: MonthPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import('chart.js').Chart | null>(null);
  const { brand, mode } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !points.length) return;

    let cancelled = false;

    void (async () => {
      const { Chart } = await import('chart.js/auto');
      if (cancelled) return;

      const chartColors = getDashboardChartColors();
      chartRef.current?.destroy();
      chartRef.current = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: points.map((m) => m.month),
          datasets: [
            {
              label: 'Collections (Cr)',
              data: points.map((m) => m.amount),
              backgroundColor: chartColors.bar,
              hoverBackgroundColor: chartColors.barLight,
              borderRadius: 6,
              borderSkipped: false
            }
          ]
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: scaleOptions(chartColors),
          animation: { duration: 600 }
        }
      });
    })();

    return () => {
      cancelled = true;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [points, brand, mode]);

  return (
    <div className="h-[220px] w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

export function SalesVsCollectionsLineChart({
  points
}: {
  points: SalesVsCollPoint[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import('chart.js').Chart | null>(null);
  const { brand, mode } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !points.length) return;

    let cancelled = false;

    void (async () => {
      const { Chart } = await import('chart.js/auto');
      if (cancelled) return;

      const chartColors = getDashboardChartColors();
      chartRef.current?.destroy();
      chartRef.current = new Chart(canvas, {
        type: 'line',
        data: {
          labels: points.map((m) => m.month),
          datasets: [
            {
              label: 'Sales',
              data: points.map((m) => m.sales),
              borderColor: chartColors.salesLine,
              backgroundColor: chartColors.salesFill,
              tension: 0.42,
              fill: true,
              pointRadius: 0,
              pointHoverRadius: 5,
              borderWidth: 2.5
            },
            {
              label: 'Collections',
              data: points.map((m) => m.collections),
              borderColor: chartColors.collectionsLine,
              backgroundColor: chartColors.collectionsFill,
              tension: 0.42,
              fill: false,
              pointRadius: 0,
              pointHoverRadius: 5,
              borderWidth: 2
            }
          ]
        },
        options: {
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: legendOptions(chartColors, 'bottom')
          },
          scales: scaleOptions(chartColors),
          animation: { duration: 600 }
        }
      });
    })();

    return () => {
      cancelled = true;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [points, brand, mode]);

  return (
    <div className="h-[220px] w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

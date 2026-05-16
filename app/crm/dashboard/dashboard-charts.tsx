'use client';

import { useEffect, useRef } from 'react';
import type { ChartOptions } from 'chart.js';
import type { InventoryBuckets, MonthPoint, SalesVsCollPoint } from './dashboard-utils';
import { CHART_DEFAULTS, DASHBOARD_CHART } from './dashboard-theme';

const CHART_HEIGHT = 220;

function scaleOptions() {
  return {
    y: {
      ticks: {
        font: CHART_DEFAULTS.font,
        color: CHART_DEFAULTS.tickColor,
        maxTicksLimit: 6
      },
      grid: { color: CHART_DEFAULTS.gridColor },
      border: { display: false }
    },
    x: {
      ticks: {
        font: CHART_DEFAULTS.font,
        color: CHART_DEFAULTS.tickColor,
        maxRotation: 0,
        autoSkip: true,
        maxTicksLimit: 8
      },
      grid: { display: false },
      border: { display: false }
    }
  } satisfies ChartOptions['scales'];
}

function legendOptions(position: 'bottom' | 'right' = 'bottom') {
  return {
    position,
    align: 'start' as const,
    labels: {
      font: CHART_DEFAULTS.font,
      color: DASHBOARD_CHART.legend,
      boxWidth: 8,
      boxHeight: 8,
      usePointStyle: true,
      pointStyle: 'circle' as const,
      padding: 14
    }
  };
}

export function InventoryDonutChart({ buckets }: { buckets: InventoryBuckets }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import('chart.js').Chart | null>(null);
  const bl = buckets.blocked;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;

    void (async () => {
      const { Chart } = await import('chart.js/auto');
      if (cancelled) return;

      chartRef.current?.destroy();

      const labels =
        bl > 0
          ? [
              `Available (${buckets.available})`,
              `Booked (${buckets.booked})`,
              `Sold (${buckets.sold})`,
              `Blocked (${bl})`
            ]
          : [
              `Available (${buckets.available})`,
              `Booked (${buckets.booked})`,
              `Sold (${buckets.sold})`
            ];
      const data =
        bl > 0
          ? [buckets.available, buckets.booked, buckets.sold, bl]
          : [buckets.available, buckets.booked, buckets.sold];
      const colors =
        bl > 0
          ? [
              DASHBOARD_CHART.available,
              DASHBOARD_CHART.booked,
              DASHBOARD_CHART.sold,
              DASHBOARD_CHART.blocked
            ]
          : [
              DASHBOARD_CHART.available,
              DASHBOARD_CHART.booked,
              DASHBOARD_CHART.sold
            ];

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
            legend: legendOptions('bottom')
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
  }, [buckets.available, buckets.booked, buckets.sold, bl]);

  return (
    <div className="h-[220px] w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

export function MonthlyCollectionsBarChart({ points }: { points: MonthPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import('chart.js').Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !points.length) return;

    let cancelled = false;

    void (async () => {
      const { Chart } = await import('chart.js/auto');
      if (cancelled) return;

      chartRef.current?.destroy();
      chartRef.current = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: points.map((m) => m.month),
          datasets: [
            {
              label: 'Collections (Cr)',
              data: points.map((m) => m.amount),
              backgroundColor: DASHBOARD_CHART.bar,
              hoverBackgroundColor: DASHBOARD_CHART.barLight,
              borderRadius: 6,
              borderSkipped: false
            }
          ]
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: scaleOptions(),
          animation: { duration: 600 }
        }
      });
    })();

    return () => {
      cancelled = true;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [points]);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !points.length) return;

    let cancelled = false;

    void (async () => {
      const { Chart } = await import('chart.js/auto');
      if (cancelled) return;

      chartRef.current?.destroy();
      chartRef.current = new Chart(canvas, {
        type: 'line',
        data: {
          labels: points.map((m) => m.month),
          datasets: [
            {
              label: 'Sales',
              data: points.map((m) => m.sales),
              borderColor: DASHBOARD_CHART.salesLine,
              backgroundColor: DASHBOARD_CHART.salesFill,
              tension: 0.42,
              fill: true,
              pointRadius: 0,
              pointHoverRadius: 5,
              borderWidth: 2.5
            },
            {
              label: 'Collections',
              data: points.map((m) => m.collections),
              borderColor: DASHBOARD_CHART.collectionsLine,
              backgroundColor: DASHBOARD_CHART.collectionsFill,
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
            legend: legendOptions('bottom')
          },
          scales: scaleOptions(),
          animation: { duration: 600 }
        }
      });
    })();

    return () => {
      cancelled = true;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [points]);

  return (
    <div className="h-[220px] w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

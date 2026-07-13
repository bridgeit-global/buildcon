/** CRM dashboard chart tokens — resolved from `app/globals.css` (`--ds-*`). */

/** CSS variable names for multi-segment donut/pie (teal scale only). */
export const CHART_SEGMENT_VAR_NAMES = [
  '--ds-primary-100',
  '--ds-primary-200',
  '--ds-primary-300',
  '--ds-primary-400',
  '--ds-primary-500',
  '--ds-primary-600',
  '--ds-primary-700',
  '--ds-primary-800'
] as const;

const CHART_VAR_MAP = {
  bar: '--ds-primary-500',
  barLight: '--ds-primary-300',
  salesLine: '--ds-primary-500',
  salesFillAlpha: 0.12,
  collectionsLine: '--ds-gray-600',
  collectionsFillAlpha: 0.06,
  grid: '--ds-gray-100',
  tick: '--ds-gray-400',
  legend: '--ds-gray-500',
  segmentMuted: '--ds-gray-400'
} as const;

export type DashboardChartColors = {
  bar: string;
  barLight: string;
  salesLine: string;
  salesFill: string;
  collectionsLine: string;
  collectionsFill: string;
  grid: string;
  tick: string;
  legend: string;
  segmentTeal: string[];
  segmentMuted: string;
};

function readDsVar(name: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hexToRgb(hex: string): [number, number, number] | null {
  const raw = hex.replace('#', '').trim();
  if (!raw) return null;
  const h =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw.length === 6
        ? raw
        : null;
  if (!h) return null;
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

let chartColorsCache: DashboardChartColors | null = null;
let themeWatchInstalled = false;

/** Clear cached chart colors when brand theme or color mode changes. */
export function clearDashboardChartColorsCache(): void {
  chartColorsCache = null;
}

function ensureThemeWatch(): void {
  if (typeof window === 'undefined' || themeWatchInstalled) return;
  themeWatchInstalled = true;
  const invalidate = () => {
    chartColorsCache = null;
  };
  window.addEventListener('buildcon:themechange', invalidate);
  const observer = new MutationObserver(invalidate);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme']
  });
}

/** Resolve chart colors from design tokens (client-only; call inside `useEffect`). */
export function getDashboardChartColors(): DashboardChartColors {
  ensureThemeWatch();
  if (chartColorsCache) return chartColorsCache;

  const salesBase = readDsVar(CHART_VAR_MAP.salesLine);
  const collBase = readDsVar(CHART_VAR_MAP.collectionsLine);

  chartColorsCache = {
    bar: readDsVar(CHART_VAR_MAP.bar),
    barLight: readDsVar(CHART_VAR_MAP.barLight),
    salesLine: salesBase,
    salesFill: withAlpha(salesBase, CHART_VAR_MAP.salesFillAlpha),
    collectionsLine: collBase,
    collectionsFill: withAlpha(collBase, CHART_VAR_MAP.collectionsFillAlpha),
    grid: readDsVar(CHART_VAR_MAP.grid),
    tick: readDsVar(CHART_VAR_MAP.tick),
    legend: readDsVar(CHART_VAR_MAP.legend),
    segmentTeal: CHART_SEGMENT_VAR_NAMES.map((name) => readDsVar(name)),
    segmentMuted: readDsVar(CHART_VAR_MAP.segmentMuted)
  };

  return chartColorsCache;
}

export function chartSegmentColor(
  index: number,
  palette: Pick<DashboardChartColors, 'segmentTeal'>
): string {
  const { segmentTeal } = palette;
  return segmentTeal[index % segmentTeal.length] ?? segmentTeal[0] ?? '';
}

export const CHART_DEFAULTS = {
  font: { size: 10, family: 'inherit' }
} as const;

export const WORKFLOW_BADGE_CLASS = [
  'bg-ds-primary-500 text-white',
  'bg-ds-primary-400 text-white',
  'bg-ds-primary-600 text-white',
  'bg-ds-primary-300 text-ds-primary-900',
  'bg-ds-primary-700 text-white',
  'bg-ds-primary-200 text-ds-primary-800',
  'bg-ds-primary-500 text-white'
] as const;

export type StatAccent = 'primary' | 'warning' | 'success' | 'accent';

export const STAT_ACCENT_CLASS: Record<
  StatAccent,
  { icon: string; sub: string }
> = {
  primary: {
    icon: 'text-ds-primary-500',
    sub: 'text-ds-primary-600'
  },
  warning: {
    icon: 'text-ds-warning-600',
    sub: 'text-ds-warning-700'
  },
  success: {
    icon: 'text-ds-success-600',
    sub: 'text-ds-success-700'
  },
  accent: {
    icon: 'text-ds-primary-400',
    sub: 'text-ds-primary-500'
  }
};

export type FinTone = 'primary' | 'success' | 'warning' | 'destructive';

export const FIN_TONE_CLASS: Record<FinTone, { value: string; icon: string }> = {
  primary: {
    value: 'text-ds-primary-600',
    icon: 'text-ds-primary-500'
  },
  success: {
    value: 'text-ds-success-600',
    icon: 'text-ds-success-600'
  },
  warning: {
    value: 'text-ds-warning-700',
    icon: 'text-ds-warning-600'
  },
  destructive: {
    value: 'text-ds-error-600',
    icon: 'text-ds-error-600'
  }
};

/** CRM dashboard palette — aligned with `globals.css` ds-* / teal primary. */

export const DASHBOARD_CHART = {
  available: '#039855',
  booked: '#dc6803',
  sold: '#0f766e',
  blocked: '#667085',
  bar: '#0d9488',
  barLight: '#2dd4bf',
  salesLine: '#0d9488',
  salesFill: 'rgba(13, 148, 136, 0.12)',
  collectionsLine: '#475467',
  collectionsFill: 'rgba(71, 84, 103, 0.06)',
  grid: '#f2f4f7',
  tick: '#98a2b3',
  legend: '#667085'
} as const;

export const CHART_DEFAULTS = {
  font: { size: 10, family: 'inherit' },
  gridColor: DASHBOARD_CHART.grid,
  tickColor: DASHBOARD_CHART.tick
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

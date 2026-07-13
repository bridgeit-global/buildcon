import { describe, expect, it } from 'vitest';
import {
  CHART_DEFAULTS,
  CHART_SEGMENT_VAR_NAMES,
  FIN_TONE_CLASS,
  STAT_ACCENT_CLASS,
  WORKFLOW_BADGE_CLASS,
  chartSegmentColor,
  getDashboardChartColors
} from './dashboard-theme';

describe('CHART_SEGMENT_VAR_NAMES', () => {
  it('lists primary design-token variables only', () => {
    expect(CHART_SEGMENT_VAR_NAMES.length).toBeGreaterThan(0);
    expect(CHART_SEGMENT_VAR_NAMES.every((n) => n.startsWith('--ds-primary-'))).toBe(true);
  });
});

describe('getDashboardChartColors', () => {
  it('returns empty strings in node (no document)', () => {
    const colors = getDashboardChartColors();
    expect(colors.bar).toBe('');
    expect(colors.segmentTeal).toHaveLength(CHART_SEGMENT_VAR_NAMES.length);
    expect(colors.segmentTeal.every((c) => c === '')).toBe(true);
  });
});

describe('chartSegmentColor', () => {
  it('cycles through the palette', () => {
    const palette = { segmentTeal: ['#a', '#b', '#c'] };
    expect(chartSegmentColor(0, palette)).toBe('#a');
    expect(chartSegmentColor(3, palette)).toBe('#a');
    expect(chartSegmentColor(1, palette)).toBe('#b');
  });

  it('returns empty string when palette is empty', () => {
    expect(chartSegmentColor(0, { segmentTeal: [] })).toBe('');
  });
});

describe('design token class maps', () => {
  it('defines workflow badge classes', () => {
    expect(WORKFLOW_BADGE_CLASS.length).toBeGreaterThan(0);
    expect(WORKFLOW_BADGE_CLASS[0]).toContain('ds-primary');
  });

  it('defines stat accent classes for all tones', () => {
    expect(STAT_ACCENT_CLASS.primary.icon).toContain('ds-primary');
    expect(STAT_ACCENT_CLASS.warning.icon).toContain('ds-warning');
    expect(STAT_ACCENT_CLASS.success.icon).toContain('ds-success');
  });

  it('defines financial tone classes', () => {
    expect(FIN_TONE_CLASS.destructive.value).toContain('ds-error');
    expect(FIN_TONE_CLASS.primary.value).toContain('ds-primary');
  });

  it('sets chart font defaults', () => {
    expect(CHART_DEFAULTS.font.size).toBe(10);
  });
});

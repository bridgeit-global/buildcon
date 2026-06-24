import type { ColumnFiltersState } from '@tanstack/react-table';
import {
  INQUIRY_CLOSED_FUNNEL_STAGE,
  INQUIRY_LIST_FUNNEL_STAGES
} from './inquiry-funnel-stages';

/** Matches dashboard KPI tiles: Enquiry stage. */
export const STAGE_FILTER_NEW_LEADS = '__new_leads__';
/** Matches dashboard Token KPI (`?stage=token`). */
export const STAGE_FILTER_TOKEN = '__token__';

export function parseInquiryListUrlColumnFilters(sp: {
  get: (name: string) => string | null;
}): ColumnFiltersState {
  const filters: ColumnFiltersState = [];
  const stageRaw = sp.get('stage')?.trim();
  if (stageRaw) {
    const lower = stageRaw.toLowerCase();
    if (lower === 'token' || lower === 'converted') {
      filters.push({ id: 'funnelStage', value: STAGE_FILTER_TOKEN });
    } else if (lower === 'new') {
      filters.push({ id: 'funnelStage', value: STAGE_FILTER_NEW_LEADS });
    } else if (lower === 'closed') {
      filters.push({ id: 'funnelStage', value: INQUIRY_CLOSED_FUNNEL_STAGE });
    } else {
      const match = [...INQUIRY_LIST_FUNNEL_STAGES].find(
        (s) => s.toLowerCase() === lower
      );
      if (match) filters.push({ id: 'funnelStage', value: match });
    }
  }
  const sourceRaw = sp.get('source')?.trim();
  if (sourceRaw) {
    filters.push({ id: 'leadSource', value: sourceRaw });
  }
  return filters;
}

/** Map internal table filter value to SearchableSelect label. */
export function stageFilterToSelectValue(filter: string): string {
  if (!filter || filter === '__all__') return 'All stages';
  if (filter === STAGE_FILTER_NEW_LEADS) return 'New';
  if (filter === STAGE_FILTER_TOKEN) return 'Token';
  return filter;
}

/** Map SearchableSelect label back to internal table filter value. */
export function selectValueToStageFilter(value: string): string | undefined {
  if (value === 'All stages') return undefined;
  if (value === 'New') return STAGE_FILTER_NEW_LEADS;
  return value;
}

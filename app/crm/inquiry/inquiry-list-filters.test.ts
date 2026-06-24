import { describe, expect, it } from 'vitest';
import {
  parseInquiryListUrlColumnFilters,
  STAGE_FILTER_NEW_LEADS,
  STAGE_FILTER_TOKEN
} from './inquiry-list-filters';

function params(input: Record<string, string>) {
  return new URLSearchParams(input);
}

describe('parseInquiryListUrlColumnFilters', () => {
  it('maps dashboard KPI aliases', () => {
    expect(
      parseInquiryListUrlColumnFilters(params({ stage: 'new' }))
    ).toEqual([{ id: 'funnelStage', value: STAGE_FILTER_NEW_LEADS }]);
    expect(
      parseInquiryListUrlColumnFilters(params({ stage: 'token' }))
    ).toEqual([{ id: 'funnelStage', value: STAGE_FILTER_TOKEN }]);
    expect(
      parseInquiryListUrlColumnFilters(params({ stage: 'converted' }))
    ).toEqual([{ id: 'funnelStage', value: STAGE_FILTER_TOKEN }]);
  });

  it('matches funnel stages case-insensitively', () => {
    expect(
      parseInquiryListUrlColumnFilters(params({ stage: 'qualified' }))
    ).toEqual([{ id: 'funnelStage', value: 'Qualified' }]);
    expect(
      parseInquiryListUrlColumnFilters(params({ stage: 'Site Visit' }))
    ).toEqual([{ id: 'funnelStage', value: 'Site Visit' }]);
    expect(
      parseInquiryListUrlColumnFilters(params({ stage: 'closed' }))
    ).toEqual([{ id: 'funnelStage', value: 'Closed' }]);
  });

  it('parses lead source filter', () => {
    expect(
      parseInquiryListUrlColumnFilters(params({ source: 'Broker' }))
    ).toEqual([{ id: 'leadSource', value: 'Broker' }]);
  });

  it('returns empty filters when stage is unknown', () => {
    expect(
      parseInquiryListUrlColumnFilters(params({ stage: 'not-a-stage' }))
    ).toEqual([]);
  });
});

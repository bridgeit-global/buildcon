import { describe, expect, it } from 'vitest';
import {
  FINANCIALS_EXPORT_LEDGER_MAX_ROWS,
  FINANCIALS_EXPORT_RECEIPTS_MAX_ROWS,
  LEDGER_EXPORT_HEADERS,
  RECEIPTS_EXPORT_HEADERS
} from './financials-export-spec';

describe('FINANCIALS_EXPORT_LEDGER_MAX_ROWS', () => {
  it('is 8000', () => {
    expect(FINANCIALS_EXPORT_LEDGER_MAX_ROWS).toBe(8000);
  });
});

describe('FINANCIALS_EXPORT_RECEIPTS_MAX_ROWS', () => {
  it('is 8000', () => {
    expect(FINANCIALS_EXPORT_RECEIPTS_MAX_ROWS).toBe(8000);
  });
});

describe('LEDGER_EXPORT_HEADERS', () => {
  it('defines expected ledger columns in order', () => {
    expect(LEDGER_EXPORT_HEADERS).toEqual([
      'project_id',
      'project_name',
      'booking_id',
      'schedule_id',
      'customer_name',
      'unit_code',
      'instalment_no',
      'milestone',
      'due_date',
      'demand_amount',
      'received_amount',
      'outstanding_amount',
      'is_overdue'
    ]);
  });

  it('has 13 columns', () => {
    expect(LEDGER_EXPORT_HEADERS.length).toBe(13);
  });
});

describe('RECEIPTS_EXPORT_HEADERS', () => {
  it('defines expected receipts columns in order', () => {
    expect(RECEIPTS_EXPORT_HEADERS).toEqual([
      'project_id',
      'project_name',
      'collection_id',
      'booking_id',
      'customer_name',
      'unit_code',
      'schedule_id',
      'instalment_no',
      'milestone',
      'received_amount',
      'received_at',
      'mode',
      'reference',
      'created_at'
    ]);
  });

  it('has 14 columns', () => {
    expect(RECEIPTS_EXPORT_HEADERS.length).toBe(14);
  });
});

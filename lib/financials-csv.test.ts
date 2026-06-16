import { describe, expect, it } from 'vitest';
import {
  buildLedgerCsv,
  buildReceiptsCsv,
  sanitizeFilenamePart,
  toCsv,
  type LedgerExportRow,
  type ReceiptExportRow
} from './financials-csv';
import {
  FINANCIALS_EXPORT_LEDGER_MAX_ROWS,
  FINANCIALS_EXPORT_RECEIPTS_MAX_ROWS,
  LEDGER_EXPORT_HEADERS,
  RECEIPTS_EXPORT_HEADERS
} from './financials-export-spec';

describe('toCsv', () => {
  it('joins headers and rows with CRLF line endings', () => {
    const csv = toCsv(['a', 'b'], [{ a: '1', b: '2' }]);
    expect(csv).toBe('a,b\r\n1,2\r\n');
  });

  it('escapes values with commas, quotes, or newlines', () => {
    const csv = toCsv(['name'], [
      { name: 'hello, world' },
      { name: 'say "hi"' },
      { name: 'line1\nline2' }
    ]);
    expect(csv).toContain('"hello, world"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"line1\nline2"');
  });

  it('treats null and undefined as empty cells', () => {
    const csv = toCsv(['x'], [{ x: null }, { x: undefined }]);
    expect(csv).toBe('x\r\n\r\n\r\n');
  });
});

describe('buildLedgerCsv', () => {
  const sampleRow: LedgerExportRow = {
    project_id: 'p1',
    project_name: 'Test Project',
    booking_id: 'b1',
    schedule_id: 's1',
    customer_name: 'John',
    unit_code: 'A-101',
    instalment_no: 1,
    milestone: 'Booking',
    due_date: '2025-01-15',
    demand_amount: '100000',
    received_amount: '50000',
    outstanding_amount: '50000',
    is_overdue: 'false'
  };

  it('includes ledger headers and row data', () => {
    const csv = buildLedgerCsv([sampleRow]);
    const lines = csv.split('\r\n').filter((l) => l.length > 0);
    expect(lines[0]).toBe(LEDGER_EXPORT_HEADERS.join(','));
    expect(lines[1]).toContain('p1');
    expect(lines[1]).toContain('A-101');
  });

  it('caps rows at FINANCIALS_EXPORT_LEDGER_MAX_ROWS', () => {
    const rows = Array.from({ length: FINANCIALS_EXPORT_LEDGER_MAX_ROWS + 10 }, () => ({
      ...sampleRow
    }));
    const csv = buildLedgerCsv(rows);
    const dataLines = csv.split('\r\n').filter((l) => l.length > 0);
    expect(dataLines.length).toBe(FINANCIALS_EXPORT_LEDGER_MAX_ROWS + 1);
  });
});

describe('buildReceiptsCsv', () => {
  const sampleRow: ReceiptExportRow = {
    project_id: 'p1',
    project_name: 'Test Project',
    collection_id: 'c1',
    booking_id: 'b1',
    customer_name: 'John',
    unit_code: 'A-101',
    schedule_id: 's1',
    instalment_no: '1',
    milestone: 'Booking',
    received_amount: '50000',
    received_at: '2025-01-20',
    mode: 'NEFT',
    reference: 'UTR123',
    created_at: '2025-01-20T10:00:00Z'
  };

  it('includes receipts headers and row data', () => {
    const csv = buildReceiptsCsv([sampleRow]);
    const lines = csv.split('\r\n').filter((l) => l.length > 0);
    expect(lines[0]).toBe(RECEIPTS_EXPORT_HEADERS.join(','));
    expect(lines[1]).toContain('UTR123');
    expect(lines[1]).toContain('NEFT');
  });

  it('caps rows at FINANCIALS_EXPORT_RECEIPTS_MAX_ROWS', () => {
    const rows = Array.from(
      { length: FINANCIALS_EXPORT_RECEIPTS_MAX_ROWS + 5 },
      () => ({ ...sampleRow })
    );
    const csv = buildReceiptsCsv(rows);
    const dataLines = csv.split('\r\n').filter((l) => l.length > 0);
    expect(dataLines.length).toBe(FINANCIALS_EXPORT_RECEIPTS_MAX_ROWS + 1);
  });
});

describe('sanitizeFilenamePart', () => {
  it('replaces non-word characters with hyphens', () => {
    expect(sanitizeFilenamePart('Sunrise Heights!')).toBe('Sunrise-Heights');
  });

  it('strips leading and trailing hyphens', () => {
    expect(sanitizeFilenamePart('---test---')).toBe('test');
  });

  it('limits length to 48 characters', () => {
    const long = 'a'.repeat(60);
    expect(sanitizeFilenamePart(long).length).toBe(48);
  });

  it('returns project for empty or whitespace-only input', () => {
    expect(sanitizeFilenamePart('')).toBe('project');
    expect(sanitizeFilenamePart('   ')).toBe('project');
    expect(sanitizeFilenamePart('!!!')).toBe('project');
  });

  it('preserves underscores and hyphens', () => {
    expect(sanitizeFilenamePart('my_project-v2')).toBe('my_project-v2');
  });
});

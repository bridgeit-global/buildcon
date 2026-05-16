import {
  FINANCIALS_EXPORT_LEDGER_MAX_ROWS,
  FINANCIALS_EXPORT_RECEIPTS_MAX_ROWS,
  LEDGER_EXPORT_HEADERS,
  RECEIPTS_EXPORT_HEADERS
} from '@/lib/financials-export-spec';

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: readonly string[], rows: Array<Record<string, unknown>>): string {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export type LedgerExportRow = {
  project_id: string;
  project_name: string;
  booking_id: string;
  schedule_id: string;
  customer_name: string;
  unit_code: string;
  instalment_no: number;
  milestone: string;
  due_date: string;
  demand_amount: string;
  received_amount: string;
  outstanding_amount: string;
  is_overdue: string;
};

export function buildLedgerCsv(rows: LedgerExportRow[]): string {
  const capped = rows.slice(0, FINANCIALS_EXPORT_LEDGER_MAX_ROWS);
  return toCsv([...LEDGER_EXPORT_HEADERS], capped as unknown as Array<Record<string, unknown>>);
}

export type ReceiptExportRow = {
  project_id: string;
  project_name: string;
  collection_id: string;
  booking_id: string;
  customer_name: string;
  unit_code: string;
  schedule_id: string;
  instalment_no: string;
  milestone: string;
  received_amount: string;
  received_at: string;
  mode: string;
  reference: string;
  created_at: string;
};

export function buildReceiptsCsv(rows: ReceiptExportRow[]): string {
  const capped = rows.slice(0, FINANCIALS_EXPORT_RECEIPTS_MAX_ROWS);
  return toCsv(
    [...RECEIPTS_EXPORT_HEADERS],
    capped as unknown as Array<Record<string, unknown>>
  );
}

export function sanitizeFilenamePart(name: string): string {
  return name
    .trim()
    .replace(/[^\w\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'project';
}

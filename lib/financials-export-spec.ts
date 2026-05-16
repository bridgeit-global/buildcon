/**
 * Phase-G collections export — integration notes (no live ERP connector).
 *
 * **Scope:** UTF-8 CSV downloads for manual import or reconciliation. No
 * WhatsApp, payment gateway, or bank file parsers in this slice.
 *
 * **Tally / ERP:** Tally Prime and Tally.ERP 9 do not expose a stable public
 * REST API in typical deployments; teams import via CSV/Excel templates or
 * Tally’s bank / transaction import. Our CSVs use plain column headers and
 * ISO dates (YYYY-MM-DD) so you can map fields in Tally’s import wizard or an
 * intermediate sheet: e.g. map `received_amount` to payment voucher amount,
 * `reference` to cheque/UTR narration, `booking_ref` as cost centre / project
 * identifier. Ledger lines (`demand_amount`, `outstanding_amount`) support
 * receivable tracking outside Tally or as supporting schedules.
 *
 * **Non-functional:** Exports are project-scoped, require CRM session cookie
 * auth, and respect Postgres RLS via the server Supabase client (same access
 * as Financials page). Large projects: server caps row count to avoid timeouts.
 */

/** Max rows per export (ledger schedule lines). */
export const FINANCIALS_EXPORT_LEDGER_MAX_ROWS = 8000;

/** Max rows for receipts export. */
export const FINANCIALS_EXPORT_RECEIPTS_MAX_ROWS = 8000;

/** Ledger CSV column order (human + Tally mapping reference). */
export const LEDGER_EXPORT_HEADERS = [
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
] as const;

/** Receipts CSV column order. */
export const RECEIPTS_EXPORT_HEADERS = [
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
] as const;

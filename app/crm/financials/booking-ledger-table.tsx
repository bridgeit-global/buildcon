'use client';

import { useMemo } from 'react';
import { CrmDataTableCell } from '@/components/data-table/crm-data-table-cell';
import { CrmDataTableHead } from '@/components/data-table/crm-data-table-head';
import {
  CRM_TABLE_FEATURES,
  useCrmTableFeatures
} from '@/components/data-table/crm-table-features';
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef
} from '@tanstack/react-table';
import { formatDisplayDate } from '@/lib/format-display-date';
import { formatInr } from '../inr-format';

export type BookingLedgerScheduleInput = {
  id: string;
  instalment_no: number;
  milestone: string;
  due_date: string | null;
  amount: number;
};

export type BookingLedgerCollectionInput = {
  id: string;
  schedule_id: string | null;
  received_amount: number;
  received_at: string | null;
  mode: string | null;
  reference: string | null;
  created_at?: string | null;
};

export type BookingLedgerRow = {
  id: string;
  sortDate: string;
  type: 'debit' | 'credit';
  label: string;
  detail: string;
  amount: number;
  runningBalance: number;
};

export function buildBookingLedgerRows(
  schedules: BookingLedgerScheduleInput[],
  collections: BookingLedgerCollectionInput[],
  scheduleLabelById: Map<string, string>
): BookingLedgerRow[] {
  const entries: Omit<BookingLedgerRow, 'runningBalance'>[] = [];

  for (const s of schedules) {
    const amt = Math.round(Number(s.amount || 0));
    if (amt <= 0) continue;
    entries.push({
      id: `demand-${s.id}`,
      sortDate: s.due_date?.slice(0, 10) || '1970-01-01',
      type: 'debit',
      label: `${s.instalment_no}. ${s.milestone}`,
      detail: s.due_date ? `Due ${formatDisplayDate(s.due_date)}` : 'Demand',
      amount: amt
    });
  }

  for (const c of collections) {
    const amt = Math.round(Number(c.received_amount || 0));
    if (amt <= 0) continue;
    const schedLabel = c.schedule_id
      ? scheduleLabelById.get(c.schedule_id)
      : null;
    entries.push({
      id: `credit-${c.id}`,
      sortDate:
        c.received_at?.slice(0, 10) ||
        c.created_at?.slice(0, 10) ||
        '2099-12-31',
      type: 'credit',
      label: schedLabel ?? 'Unassigned receipt',
      detail: [c.mode, c.reference].filter(Boolean).join(' · ') || 'Collection',
      amount: amt
    });
  }

  entries.sort((a, b) => {
    const d = a.sortDate.localeCompare(b.sortDate);
    if (d !== 0) return d;
    if (a.type !== b.type) return a.type === 'debit' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  let balance = 0;
  return entries.map((e) => {
    if (e.type === 'debit') balance += e.amount;
    else balance -= e.amount;
    return { ...e, runningBalance: balance };
  });
}

type BookingLedgerTableProps = {
  rows: BookingLedgerRow[];
  loading?: boolean;
};

export function BookingLedgerTable({ rows, loading }: BookingLedgerTableProps) {
  const columns = useMemo<ColumnDef<BookingLedgerRow, unknown>[]>(
    () => [
      {
        id: 'date',
        header: 'Date',
        accessorKey: 'sortDate',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums text-ds-gray-700">
            {formatDisplayDate(
              row.original.sortDate === '1970-01-01' ||
                row.original.sortDate === '2099-12-31'
                ? null
                : row.original.sortDate
            )}
          </span>
        )
      },
      {
        id: 'type',
        header: 'Type',
        accessorKey: 'type',
        cell: ({ row }) => (
          <span
            className={
              row.original.type === 'debit'
                ? 'font-medium text-ds-error-700'
                : 'font-medium text-ds-success-700'
            }
          >
            {row.original.type === 'debit' ? 'Debit (demand)' : 'Credit (receipt)'}
          </span>
        )
      },
      {
        id: 'label',
        header: 'Description',
        accessorKey: 'label',
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-ds-gray-900">{row.original.label}</div>
            <div className="text-xs text-ds-gray-500">{row.original.detail}</div>
          </div>
        )
      },
      {
        id: 'amount',
        header: 'Amount',
        accessorKey: 'amount',
        cell: ({ row }) => (
          <span className="tabular-nums font-semibold text-ds-gray-900">
            {row.original.type === 'debit' ? '+' : '−'}
            {formatInr(row.original.amount, { maximumFractionDigits: 0 })}
          </span>
        )
      },
      {
        id: 'balance',
        header: 'Balance',
        accessorKey: 'runningBalance',
        cell: ({ row }) => (
          <span
            className={`tabular-nums font-semibold ${
              row.original.runningBalance > 0
                ? 'text-ds-error-700'
                : row.original.runningBalance < 0
                  ? 'text-ds-success-700'
                  : 'text-ds-gray-700'
            }`}
          >
            {formatInr(Math.abs(row.original.runningBalance), {
              maximumFractionDigits: 0
            })}
            {row.original.runningBalance > 0
              ? ' due'
              : row.original.runningBalance < 0
                ? ' advance'
                : ''}
          </span>
        )
      }
    ],
    []
  );

  const { sorting, onSortingChange, columnSizing, onColumnSizingChange } =
    useCrmTableFeatures();

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnSizing },
    onSortingChange,
    onColumnSizingChange,
    getCoreRowModel: getCoreRowModel(),
    ...CRM_TABLE_FEATURES
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-ds-gray-200">
      <table
        className="w-full min-w-[40rem] caption-bottom text-sm"
        style={{ width: table.getCenterTotalSize() }}
      >
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-ds-gray-100 bg-ds-gray-50/80">
              {hg.headers.map((h) => (
                <CrmDataTableHead key={h.id} header={h} />
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-ds-gray-500">
                Loading ledger…
              </td>
            </tr>
          ) : table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-ds-gray-500">
                No ledger entries yet. Demands appear from the payment schedule; credits when you
                post collections.
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-ds-gray-100 last:border-0 transition-colors hover:bg-ds-gray-50/60">
                {row.getVisibleCells().map((cell) => (
                  <CrmDataTableCell key={cell.id} cell={cell} className="align-top" />
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

'use client';

import { formatDisplayDate } from '@/lib/format-display-date';
import { formatInr } from '../inr-format';
import type { ReactNode } from 'react';

export type PaymentScheduleLine = {
  id?: string;
  instalment_no: number;
  milestone: string;
  due_date: string | null;
  amount: number;
};

export type PaymentScheduleReceiptLine = {
  id: string;
  schedule_id: string | null;
  received_amount: number;
  received_at: string | null;
  mode: string | null;
  reference: string | null;
  created_at: string | null;
};

type Props = {
  rows: PaymentScheduleLine[];
  receivedBySchedule?: Record<string, number>;
  receiptsBySchedule?: Record<string, PaymentScheduleReceiptLine[]>;
  receiptCell?: (row: PaymentScheduleLine & { received: number; balance: number }) => ReactNode;
  demandCell?: (row: PaymentScheduleLine & { received: number; balance: number }) => ReactNode;
  loading?: boolean;
  compact?: boolean;
  onlyUnpaid?: boolean;
  actions?: (row: PaymentScheduleLine & { received: number; balance: number }) => ReactNode;
};

export function PaymentScheduleTable({
  rows,
  receivedBySchedule = {},
  receiptsBySchedule,
  receiptCell,
  demandCell,
  loading,
  compact,
  onlyUnpaid,
  actions
}: Props) {
  const displayRows = onlyUnpaid
    ? rows.filter((r) => {
        const key = r.id ?? '';
        const rec = key ? receivedBySchedule[key] || 0 : 0;
        const bal = (r.amount || 0) - rec;
        return bal > 0;
      })
    : rows;

  const totalAmount = displayRows.reduce((s, r) => s + (r.amount || 0), 0);
  const totalReceived = displayRows.reduce((s, r) => {
    const key = r.id ?? '';
    return s + (key ? receivedBySchedule[key] || 0 : 0);
  }, 0);
  const totalBalance = totalAmount - totalReceived;
  const cellPad = compact ? 'px-3 py-2' : 'px-4 py-3';
  const colCount =
    (actions ? 8 : 7) + (receiptsBySchedule ? 1 : 0) + (demandCell ? 1 : 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-ds-gray-200">
      <table className="w-full min-w-4xl caption-bottom text-sm">
        <thead>
          <tr className="border-b border-ds-gray-100 bg-ds-gray-50/80">
            {[
              '#',
              'Milestone',
              'Due date',
              'Amount',
              'Received',
              'Balance',
              ...(receiptsBySchedule ? ['Receipts'] : []),
              ...(demandCell ? ['Demand'] : []),
              'Status',
              ...(actions ? ['Actions'] : [])
            ].map((h) => (
                <th
                  key={h}
                  className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500"
                >
                  {h}
                </th>
              ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td
                colSpan={colCount}
                className="px-4 py-12 text-center text-ds-gray-500"
              >
                Loading schedule…
              </td>
            </tr>
          ) : null}
          {!loading
            ? displayRows.map((s) => {
                const rec = s.id ? receivedBySchedule[s.id] || 0 : 0;
                const bal = (s.amount || 0) - rec;
                const status =
                  bal <= 0 ? 'Paid' : rec > 0 ? 'Partially paid' : 'Pending';
                const calcRow = { ...s, received: rec, balance: bal };
                const receipts = s.id && receiptsBySchedule ? receiptsBySchedule[s.id] || [] : [];
                const receiptsCount = receipts.length;
                const latestReceipt =
                  receiptsCount > 0
                    ? receipts.reduce<PaymentScheduleReceiptLine | null>((latest, r) => {
                        if (!latest) return r;
                        const a = latest.received_at || latest.created_at || '';
                        const b = r.received_at || r.created_at || '';
                        return b > a ? r : latest;
                      }, null)
                    : null;
                return (
                  <tr key={s.id ?? s.instalment_no} className="border-b border-ds-gray-100 last:border-0 transition-colors hover:bg-ds-gray-50/60">
                    <td className={`${cellPad} text-ds-gray-600`}>{s.instalment_no}</td>
                    <td className={`${cellPad} font-semibold text-ds-gray-900`}>
                      {s.milestone}
                    </td>
                    <td className={`${cellPad} text-ds-gray-600`}>
                      {formatDisplayDate(s.due_date)}
                    </td>
                    <td className={`${cellPad} text-ds-gray-700`}>
                      ₹ {formatInr(Number(s.amount || 0), { maximumFractionDigits: 0 })}
                    </td>
                    <td className={`${cellPad} font-semibold text-ds-success-700`}>
                      ₹ {formatInr(rec, { maximumFractionDigits: 0 })}
                    </td>
                    <td className={`${cellPad} font-semibold text-ds-error-700`}>
                      ₹ {formatInr(bal, { maximumFractionDigits: 0 })}
                    </td>
                    {receiptsBySchedule ? (
                      <td className={cellPad}>
                        {receiptCell ? (
                          receiptCell(calcRow)
                        ) : receiptsCount > 0 ? (
                          <div className="space-y-0.5">
                            <div className="text-xs font-semibold text-ds-gray-900">
                              {receiptsCount} {receiptsCount === 1 ? 'receipt' : 'receipts'}
                            </div>
                            <div className="text-xs text-ds-gray-500">
                              Latest:{' '}
                              {formatDisplayDate(
                                latestReceipt?.received_at || latestReceipt?.created_at || null
                              )}
                              {latestReceipt?.reference
                                ? ` · ${latestReceipt.reference}`
                                : latestReceipt?.mode
                                  ? ` · ${latestReceipt.mode}`
                                  : ''}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-ds-gray-500">—</span>
                        )}
                      </td>
                    ) : null}
                    {demandCell ? <td className={cellPad}>{demandCell(calcRow)}</td> : null}
                    <td className={cellPad}>
                      <span className="rounded-full border border-ds-gray-200 px-2 py-0.5 text-xs text-ds-gray-700">
                        {status}
                      </span>
                    </td>
                    {actions ? (
                      <td className={cellPad}>
                        {actions(calcRow)}
                      </td>
                    ) : null}
                  </tr>
                );
              })
            : null}
          {!loading && displayRows.length === 0 ? (
            <tr>
              <td
                colSpan={colCount}
                className="px-4 py-12 text-center text-ds-gray-500"
              >
                {onlyUnpaid
                  ? 'No unpaid instalments in this schedule.'
                  : 'No payment schedule yet. Confirm the booking or configure CLD stages on the project.'}
              </td>
            </tr>
          ) : null}
        </tbody>
        {displayRows.length > 0 && !loading ? (
          <tfoot>
            <tr className="border-t border-ds-gray-100 bg-ds-gray-50/80">
              <td
                colSpan={3}
                className="px-4 py-3 font-semibold text-ds-gray-900"
              >
                {onlyUnpaid ? 'Total (unpaid)' : 'Total'}
              </td>
              <td className="px-4 py-3 font-semibold text-ds-gray-900">
                ₹ {formatInr(totalAmount, { maximumFractionDigits: 0 })}
              </td>
              <td className="px-4 py-3 font-semibold text-ds-success-700">
                ₹ {formatInr(totalReceived, { maximumFractionDigits: 0 })}
              </td>
              <td className="px-4 py-3 font-semibold text-ds-error-700">
                ₹ {formatInr(totalBalance, { maximumFractionDigits: 0 })}
              </td>
              <td
                colSpan={
                  (receiptsBySchedule ? 1 : 0) + (demandCell ? 1 : 0) + (actions ? 2 : 1)
                }
              />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

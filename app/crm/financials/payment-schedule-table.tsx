'use client';

import { formatDisplayDate } from '@/lib/format-display-date';
import { formatInr } from '../inr-format';

export type PaymentScheduleLine = {
  id?: string;
  instalment_no: number;
  milestone: string;
  due_date: string | null;
  amount: number;
};

type Props = {
  rows: PaymentScheduleLine[];
  receivedBySchedule?: Record<string, number>;
  loading?: boolean;
  compact?: boolean;
  onlyUnpaid?: boolean;
};

export function PaymentScheduleTable({
  rows,
  receivedBySchedule = {},
  loading,
  compact,
  onlyUnpaid
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

  return (
    <div className="overflow-x-auto rounded-lg border border-ds-gray-200">
      <table className="w-full min-w-[56rem] caption-bottom text-sm">
        <thead>
          <tr className="border-b border-ds-gray-100 bg-ds-gray-50/80">
            {['#', 'Milestone', 'Due date', 'Amount', 'Received', 'Balance', 'Status'].map(
              (h) => (
                <th
                  key={h}
                  className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500"
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td
                colSpan={7}
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
                    <td className={cellPad}>
                      <span className="rounded-full border border-ds-gray-200 px-2 py-0.5 text-xs text-ds-gray-700">
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })
            : null}
          {!loading && displayRows.length === 0 ? (
            <tr>
              <td
                colSpan={7}
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
              <td />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

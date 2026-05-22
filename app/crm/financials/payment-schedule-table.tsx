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
};

export function PaymentScheduleTable({
  rows,
  receivedBySchedule = {},
  loading,
  compact
}: Props) {
  const totalAmount = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const totalReceived = rows.reduce((s, r) => {
    const key = r.id ?? '';
    return s + (key ? receivedBySchedule[key] || 0 : 0);
  }, 0);
  const totalBalance = totalAmount - totalReceived;
  const cellPad = compact ? 'px-3 py-2' : 'px-4 py-3';

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[56rem] w-full caption-bottom text-sm">
        <thead className="bg-ds-gray-50 text-xs text-ds-gray-500">
          <tr>
            {['#', 'Milestone', 'Due date', 'Amount', 'Received', 'Balance', 'Status'].map(
              (h) => (
                <th
                  key={h}
                  className={`${cellPad} border-b border-ds-gray-200 text-left font-semibold`}
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
                className={`${cellPad} text-center text-ds-gray-500`}
              >
                Loading schedule…
              </td>
            </tr>
          ) : null}
          {!loading
            ? rows.map((s) => {
                const rec = s.id ? receivedBySchedule[s.id] || 0 : 0;
                const bal = (s.amount || 0) - rec;
                const status =
                  bal <= 0 ? 'Paid' : rec > 0 ? 'Partially paid' : 'Pending';
                return (
                  <tr key={s.id ?? s.instalment_no} className="border-b border-ds-gray-100">
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
          {!loading && rows.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                className={`${cellPad} py-10 text-center text-ds-gray-500`}
              >
                No payment schedule yet. Confirm the booking or configure CLD stages
                on the project.
              </td>
            </tr>
          ) : null}
        </tbody>
        {rows.length > 0 && !loading ? (
          <tfoot>
            <tr className="bg-ds-gray-50">
              <td
                colSpan={3}
                className={`${cellPad} font-semibold text-ds-gray-900`}
              >
                Total
              </td>
              <td className={`${cellPad} font-semibold text-ds-gray-900`}>
                ₹ {formatInr(totalAmount, { maximumFractionDigits: 0 })}
              </td>
              <td className={`${cellPad} font-semibold text-ds-success-700`}>
                ₹ {formatInr(totalReceived, { maximumFractionDigits: 0 })}
              </td>
              <td className={`${cellPad} font-semibold text-ds-error-700`}>
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

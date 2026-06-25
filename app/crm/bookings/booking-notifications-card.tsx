'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { pageError, toast } from '@/lib/toast';
import { Loader2, RefreshCw, Send } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatDisplayDateTime } from '@/lib/format-display-date';
import { notificationStatusColor, StatusChip } from '@/components/ui/status-chip';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CrmTableBodySkeleton } from '../_components/crm-skeletons';

type OutboundRow = {
  id: string;
  generated_document_id: string | null;
  channel: 'email' | 'whatsapp' | 'sms';
  provider: 'resend' | 'smtp' | 'meta_cloud' | 'smsalert';
  status: 'queued' | 'sent' | 'failed' | 'delivered' | 'read' | 'skipped';
  template_name: string | null;
  recipient: string | null;
  error: string | null;
  attempts: number;
  processed_at: string | null;
  created_at: string;
};

type Props = {
  bookingId: string;
};

export function BookingNotificationsCard({ bookingId }: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [rows, setRows] = useState<OutboundRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [retryBusy, setRetryBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
        const { data, error: e } = await supabase
      .from('outbound_notifications')
      .select(
        'id,generated_document_id,channel,provider,status,template_name,recipient,error,attempts,processed_at,created_at'
      )
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (e) pageError(e.message);
    setRows((data ?? []) as OutboundRow[]);
    setLoading(false);
  }, [bookingId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const retryDispatch = async (row: OutboundRow) => {
    if (!row.generated_document_id) {
      pageError('This row has no linked document to retry.');
      return;
    }
    setRetryBusy(row.id);
    try {
      const res = await fetch(
        `/api/crm/bookings/${encodeURIComponent(bookingId)}/documents/notify`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ generatedDocumentId: row.generated_document_id })
        }
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? 'Retry failed');
      }
      toast.success('Notification dispatched.');
      await load();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Retry failed');
    } finally {
      setRetryBusy(null);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ds-gray-900">Customer notifications</h3>
          <p className="text-xs text-ds-gray-500">
            Email (SMTP), plain-text SMS (SMS Alert), and WhatsApp (Meta Cloud) for this booking. Failed rows can be retried.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>
      {loading && rows.length === 0 ? (
        <div className="overflow-hidden rounded-lg border border-ds-gray-200">
          <table className="w-full caption-bottom text-sm">
            <tbody>
              <CrmTableBodySkeleton colSpan={7} rows={4} />
            </tbody>
          </table>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ds-gray-500">No notifications yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ds-gray-200">
          <table className="w-full min-w-3xl caption-bottom text-sm">
            <thead>
              <tr className="border-b border-ds-gray-100 bg-ds-gray-50/80">
                <th className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500">When</th>
                <th className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500">Channel</th>
                <th className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500">Recipient</th>
                <th className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500">Status</th>
                <th className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500">Template</th>
                <th className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500">Notes</th>
                <th className="h-10 px-4 text-left align-middle text-xs font-semibold text-ds-gray-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ds-gray-100 last:border-0 transition-colors hover:bg-ds-gray-50/60">
                  <td className="px-4 py-3 text-xs text-ds-gray-600">
                    {formatDisplayDateTime(r.processed_at ?? r.created_at)}
                  </td>
                  <td className="px-4 py-3 capitalize">{r.channel}</td>
                  <td className="px-4 py-3 text-xs text-ds-gray-700">{r.recipient ?? '—'}</td>
                  <td className="px-4 py-3">
                    <StatusChip color={notificationStatusColor(r.status)} size="md">
                      {r.status}
                    </StatusChip>
                  </td>
                  <td className="px-4 py-3 text-xs text-ds-gray-700">{r.template_name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-ds-error-700">{r.error ?? '—'}</td>
                  <td className="px-4 py-3">
                    {(r.status === 'failed' || r.status === 'skipped') &&
                    r.generated_document_id ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        disabled={retryBusy === r.id}
                        onClick={() => void retryDispatch(r)}
                      >
                        {retryBusy === r.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}
                        Retry
                      </Button>
                    ) : (
                      <span className="text-xs text-ds-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
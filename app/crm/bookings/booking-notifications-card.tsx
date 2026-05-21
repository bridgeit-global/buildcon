'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Send } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type OutboundRow = {
  id: string;
  generated_document_id: string | null;
  channel: 'email' | 'whatsapp';
  provider: 'resend' | 'meta_cloud';
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
  const [resendBusy, setResendBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    setError('');
    const { data, error: e } = await supabase
      .from('outbound_notifications')
      .select(
        'id,generated_document_id,channel,provider,status,template_name,recipient,error,attempts,processed_at,created_at'
      )
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (e) setError(e.message);
    setRows((data ?? []) as OutboundRow[]);
    setLoading(false);
  }, [bookingId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const resend = async (row: OutboundRow) => {
    if (!row.generated_document_id) {
      setError('This row has no linked document to resend.');
      return;
    }
    setResendBusy(row.id);
    setError('');
    setNotice('');
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
        throw new Error(json.error ?? 'Resend failed');
      }
      setNotice('Notification dispatched.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resend failed');
    } finally {
      setResendBusy(null);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ds-gray-900">Customer notifications</h3>
          <p className="text-xs text-ds-gray-500">
            Email (Resend) and WhatsApp (Meta Cloud) dispatches for this booking. Failed rows can be re-sent.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-ds-error-700">{error}</p>
      ) : null}
      {notice ? <p className="text-sm text-ds-primary-700">{notice}</p> : null}

      {loading ? (
        <p className="text-sm text-ds-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ds-gray-500">No notifications yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ds-gray-200">
          <table className="w-full min-w-3xl caption-bottom text-sm">
            <thead className="bg-ds-gray-50 text-left text-xs font-semibold text-ds-gray-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Channel</th>
                <th className="px-3 py-2">Recipient</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Template</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-ds-gray-100">
                  <td className="px-3 py-2 text-xs text-ds-gray-600">
                    {new Date(r.processed_at ?? r.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 capitalize">{r.channel}</td>
                  <td className="px-3 py-2 text-xs text-ds-gray-700">{r.recipient ?? '—'}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2 text-xs text-ds-gray-700">{r.template_name ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-ds-error-700">{r.error ?? '—'}</td>
                  <td className="px-3 py-2">
                    {(r.status === 'failed' || r.status === 'skipped') &&
                    r.generated_document_id ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        disabled={resendBusy === r.id}
                        onClick={() => void resend(r)}
                      >
                        {resendBusy === r.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}
                        Resend
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

function StatusBadge({ status }: { status: OutboundRow['status'] }) {
  const color =
    status === 'sent' || status === 'delivered' || status === 'read'
      ? '#0d9488'
      : status === 'failed'
        ? '#dc2626'
        : status === 'skipped'
          ? '#64748b'
          : '#f97316';
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: `${color}1a`, color }}
    >
      {status}
    </span>
  );
}

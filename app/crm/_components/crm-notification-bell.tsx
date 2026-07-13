'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDisplayDateTime } from '@/lib/format-display-date';
import { Skeleton } from '@/components/ui/skeleton';

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
};

export function CrmNotificationBell() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/crm/notifications?limit=15');
      const json = (await res.json()) as {
        rows?: NotificationRow[];
        unread?: number;
        error?: string;
      };
      if (res.ok) {
        setRows(json.rows ?? []);
        setUnread(json.unread ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  async function markRead(ids: string[]) {
    await fetch('/api/crm/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    await load();
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="relative size-9 shrink-0 rounded-xl"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </Button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-card shadow-lg"
            role="dialog"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between border-b border-ds-gray-100 px-3 py-2">
              <p className="text-xs font-semibold text-ds-gray-800">Notifications</p>
              {unread > 0 ? (
                <button
                  type="button"
                  className="text-[10px] font-medium text-ds-primary-700 hover:underline"
                  onClick={() =>
                    void fetch('/api/crm/notifications', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ markAllRead: true })
                    }).then(() => load())
                  }
                >
                  Mark all read
                </button>
              ) : null}
            </div>
            <ul className="max-h-72 overflow-y-auto">
              {loading && rows.length === 0 ? (
                <li className="px-3 py-4">
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                </li>
              ) : rows.length === 0 ? (
                <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No notifications yet.
                </li>
              ) : (
                rows.map((n) => (
                  <li
                    key={n.id}
                    className={cn(
                      'border-b border-ds-gray-50 px-3 py-2.5 last:border-0',
                      !n.read_at && 'bg-ds-primary-50/40'
                    )}
                  >
                    {n.link_path ? (
                      <Link
                        href={n.link_path}
                        className="block min-w-0"
                        onClick={() => {
                          setOpen(false);
                          if (!n.read_at) void markRead([n.id]);
                        }}
                      >
                        <NotificationItem row={n} />
                      </Link>
                    ) : (
                      <NotificationItem row={n} />
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}

function NotificationItem({ row }: { row: NotificationRow }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs font-semibold text-foreground">{row.title}</p>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ds-gray-600">
        {row.body}
      </p>
      <p className="mt-1 text-[10px] text-ds-gray-400">
        {formatDisplayDateTime(row.created_at)}
      </p>
    </div>
  );
}

'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X
} from 'lucide-react';
import {
  dismissToast,
  getToasts,
  subscribeToToasts,
  type ToastRecord,
  type ToastSeverity
} from '@/lib/toast';
import { cn } from '@/lib/utils';

const SEVERITY_STYLES: Record<
  ToastSeverity,
  { container: string; icon: string; Icon: typeof Info }
> = {
  default: {
    container: 'border-ds-gray-200 bg-white text-ds-gray-800',
    icon: 'text-ds-gray-500',
    Icon: Info
  },
  success: {
    container: 'border-ds-success-200 bg-ds-success-25 text-ds-success-900',
    icon: 'text-ds-success-600',
    Icon: CheckCircle2
  },
  error: {
    container: 'border-ds-error-200 bg-ds-error-25 text-ds-error-700',
    icon: 'text-ds-error-600',
    Icon: AlertCircle
  },
  warning: {
    container: 'border-ds-warning-200 bg-ds-warning-25 text-ds-warning-900',
    icon: 'text-ds-warning-700',
    Icon: AlertTriangle
  },
  info: {
    container: 'border-ds-primary-200 bg-ds-primary-50 text-ds-gray-800',
    icon: 'text-ds-primary-600',
    Icon: Info
  }
};

function ToastItem({ toast: item }: { toast: ToastRecord }) {
  const styles = SEVERITY_STYLES[item.severity];
  const Icon = styles.Icon;
  const hasBody = Boolean(item.title || item.description);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-auto flex w-full max-w-sm gap-3 rounded-xl border p-4 shadow-lg',
        styles.container
      )}
    >
      <Icon className={cn('mt-0.5 size-5 shrink-0', styles.icon)} aria-hidden />
      <div className="min-w-0 flex-1">
        {item.title ? (
          <p className="text-sm font-semibold leading-snug">{item.title}</p>
        ) : null}
        {item.description ? (
          <p
            className={cn(
              'text-sm leading-snug text-ds-gray-600',
              item.title ? 'mt-1' : ''
            )}
          >
            {item.description}
          </p>
        ) : null}
        {!hasBody ? (
          <p className="text-sm font-medium">Notification</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-ds-gray-500 transition-colors hover:bg-black/5 hover:text-ds-gray-800"
        aria-label="Dismiss notification"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToToasts, getToasts, () => []);

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 top-0 z-100 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end sm:p-6"
    >
      {toasts.map((item) => (
        <ToastItem key={item.id} toast={item} />
      ))}
    </div>,
    document.body
  );
}

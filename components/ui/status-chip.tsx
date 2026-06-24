import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  normalizeUnitStatusCode,
  STATUS_COLOR,
  statusLabelForUnit
} from '@/app/crm/inventory/unit-status';
import { INQUIRY_CLOSED_FUNNEL_STAGE } from '@/app/crm/inquiry/inquiry-funnel-stages';

export type StatusChipTone =
  | 'success'
  | 'warning'
  | 'error'
  | 'primary'
  | 'primary-strong'
  | 'gray'
  | 'muted'
  | 'neutral'
  | 'info';

const TONE_CLASS: Record<StatusChipTone, string> = {
  success: 'border-ds-success-200 bg-ds-success-50 text-ds-success-800',
  warning: 'border-ds-warning-200 bg-ds-warning-50 text-ds-warning-800',
  error: 'border-ds-error-200 bg-ds-error-50 text-ds-error-700',
  primary: 'border-teal-200 bg-teal-50 text-teal-900',
  'primary-strong': 'border-teal-300 bg-teal-100 text-teal-950',
  gray: 'border-ds-gray-300 bg-ds-gray-100 text-ds-gray-800',
  muted: 'border-slate-200 bg-slate-50 text-slate-800',
  neutral: 'border-ds-gray-200 bg-ds-gray-100 text-ds-gray-600',
  info: 'border-ds-primary-200 bg-ds-primary-50 text-ds-primary-700'
};

const SIZE_CLASS = {
  xs: 'px-2 py-0.5 text-[9px] font-bold',
  sm: 'px-2 py-0.5 text-[10px] font-semibold',
  md: 'px-2 py-0.5 text-xs font-semibold'
} as const;

export type StatusChipProps = {
  children: ReactNode;
  tone?: StatusChipTone;
  /** Hex color for dynamic badges (e.g. unit lifecycle). */
  color?: string;
  size?: keyof typeof SIZE_CLASS;
  border?: boolean;
  uppercase?: boolean;
  className?: string;
};

export function StatusChip({
  children,
  tone = 'neutral',
  color,
  size = 'sm',
  border = true,
  uppercase = false,
  className
}: StatusChipProps) {
  const useHex = Boolean(color);

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full',
        SIZE_CLASS[size],
        !useHex && border && 'border',
        !useHex && TONE_CLASS[tone],
        uppercase && 'uppercase tracking-wide',
        className
      )}
      style={
        useHex
          ? {
              background: `${color}22`,
              color,
              ...(border
                ? { borderWidth: 1, borderStyle: 'solid', borderColor: `${color}44` }
                : {})
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}

export function UnitStatusChip({
  status,
  className,
  size = 'xs'
}: {
  status: string | null | undefined;
  className?: string;
  size?: keyof typeof SIZE_CLASS;
}) {
  const raw = String(status || '').trim();
  const code = normalizeUnitStatusCode(status);
  const color = STATUS_COLOR[raw] ?? STATUS_COLOR[code] ?? '#94A3B8';
  const label = statusLabelForUnit(status);

  return (
    <StatusChip color={color} size={size} className={className}>
      {label}
    </StatusChip>
  );
}

export function projectStatusTone(status: string): StatusChipTone {
  if (status === 'Active') return 'success';
  if (status === 'Planning') return 'warning';
  return 'gray';
}

export function brokerStatusTone(status: string): StatusChipTone {
  return status === 'Active' ? 'success' : 'neutral';
}

export function approvalStatusTone(
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | string
): StatusChipTone {
  switch (status) {
    case 'Pending':
      return 'warning';
    case 'Approved':
      return 'primary';
    case 'Rejected':
      return 'error';
    case 'Cancelled':
      return 'muted';
    default:
      return 'muted';
  }
}

export function funnelStageTone(stage: string): StatusChipTone {
  const s = String(stage || '').trim();
  if (s === INQUIRY_CLOSED_FUNNEL_STAGE) return 'gray';
  if (!s || s === 'Enquiry') return 'error';
  if (s === 'Qualified') return 'primary';
  if (s === 'Site Visit') return 'success';
  if (s === 'Token') return 'primary-strong';
  return 'muted';
}

export function possessionUnitStatusTone(status: string | null | undefined): StatusChipTone {
  return normalizeUnitStatusCode(status) === 'POSSESSED' ? 'info' : 'primary';
}

export function bookingWorkflowTone(
  workflowStage: string,
  cancelled: boolean
): StatusChipTone {
  if (cancelled) return 'error';
  if (workflowStage === 'confirmation') return 'info';
  return 'neutral';
}

export function notificationStatusColor(status: string): string {
  if (status === 'sent' || status === 'delivered' || status === 'read') return '#0d9488';
  if (status === 'failed') return '#dc2626';
  if (status === 'skipped') return '#64748b';
  return '#f97316';
}

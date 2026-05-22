'use client';

import { CalendarClock } from 'lucide-react';
import { formatDisplayDateTime } from '@/lib/format-display-date';
import {
  followUpDueState,
  type FollowUpDueState
} from '@/lib/inquiry/follow-up-due';
import { cn } from '@/lib/utils';

const DUE_COPY: Record<Exclude<FollowUpDueState, 'invalid'>, string> = {
  overdue: 'Follow-up overdue — complete as soon as possible.',
  today: 'Follow-up due today — complete before end of day.',
  upcoming: 'Follow-up scheduled — assigned team should complete by the due time.'
};

function dueBannerClass(state: FollowUpDueState): string {
  switch (state) {
    case 'overdue':
      return 'border-ds-error-200 bg-ds-error-50 text-ds-error-900';
    case 'today':
      return 'border-ds-warning-200 bg-ds-warning-50 text-ds-warning-900';
    case 'upcoming':
      return 'border-ds-primary-200 bg-ds-primary-50 text-ds-gray-800';
    default:
      return 'border-ds-gray-200 bg-ds-gray-50 text-ds-gray-700';
  }
}

type InquiryFollowUpBannerProps = {
  followUpDate: string;
  /** When true, emphasise that the logged-in user owns this follow-up. */
  assignedToMe?: boolean;
  className?: string;
};

export function InquiryFollowUpBanner({
  followUpDate,
  assignedToMe = false,
  className
}: InquiryFollowUpBannerProps) {
  const due = String(followUpDate || '').trim();
  if (!due) return null;

  const state = followUpDueState(due);
  if (state === 'invalid') return null;

  return (
    <div
      role="status"
      className={cn(
        'flex gap-2 rounded-lg border px-3 py-2.5 text-xs',
        dueBannerClass(state),
        className
      )}
    >
      <CalendarClock className="mt-0.5 size-4 shrink-0 opacity-80" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">
          {assignedToMe ? 'Your follow-up' : 'Team follow-up'} ·{' '}
          {formatDisplayDateTime(due)}
        </p>
        <p className="mt-0.5 text-[11px] opacity-90">{DUE_COPY[state]}</p>
      </div>
    </div>
  );
}

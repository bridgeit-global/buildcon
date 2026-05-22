/** Classify a follow-up datetime for work-queue highlighting (local timezone). */
export type FollowUpDueState = 'overdue' | 'today' | 'upcoming' | 'invalid';

export function followUpDueState(
  dueAt: string,
  now: Date = new Date()
): FollowUpDueState {
  const raw = String(dueAt || '').trim();
  if (!raw) return 'invalid';
  const due = new Date(raw);
  if (Number.isNaN(due.getTime())) return 'invalid';

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  if (due.getTime() < startOfToday.getTime()) return 'overdue';
  if (due.getTime() < endOfToday.getTime()) return 'today';
  return 'upcoming';
}

export function followUpNeedsAttention(
  dueAt: string,
  now: Date = new Date()
): boolean {
  const state = followUpDueState(dueAt, now);
  return state === 'overdue' || state === 'today';
}

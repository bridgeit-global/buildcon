/** Values for native `<input type="date">` and `<input type="datetime-local">` (local timezone). */

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DD` in the user's local calendar (for `type="date"`). */
export function todayIsoDate(at: Date = new Date()): string {
  return `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}`;
}

/** `YYYY-MM-DDTHH:mm` in local time (for `type="datetime-local"`). */
export function datetimeLocalValue(at: Date = new Date()): string {
  return `${todayIsoDate(at)}T${pad2(at.getHours())}:${pad2(at.getMinutes())}`;
}

/** `YYYY-MM-DDTHH:mm` one week from `at` (for follow-up date defaults). */
export function datetimeLocalValueNextWeek(at: Date = new Date()): string {
  const d = new Date(at);
  d.setDate(d.getDate() + 7);
  return datetimeLocalValue(d);
}

/** `YYYY-MM-DD` one week from `at` (for expected close date defaults). */
export function nextWeekIsoDate(at: Date = new Date()): string {
  const d = new Date(at);
  d.setDate(d.getDate() + 7);
  return todayIsoDate(d);
}

export function withDateInputDefault(
  value: string | null | undefined,
  fallback: string
): string {
  return String(value ?? '').trim() || fallback;
}

/** True when `iso` is empty or on/before today in the local calendar. */
export function isIsoDateNotAfterToday(iso: string, at: Date = new Date()): boolean {
  const t = iso.trim();
  if (!t) return true;
  return t <= todayIsoDate(at);
}

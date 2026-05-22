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

export function withDateInputDefault(
  value: string | null | undefined,
  fallback: string
): string {
  return String(value ?? '').trim() || fallback;
}

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

export type DobParts = {
  day: string;
  month: string;
  year: string;
};

export function dobPartsFromIso(iso: string | null | undefined): DobParts {
  const t = String(iso ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return { day: '', month: '', year: '' };
  }
  const [year, month, day] = t.split('-');
  return { day: day ?? '', month: month ?? '', year: year ?? '' };
}

export function isoFromDobParts(parts: DobParts): string {
  const day = parts.day.trim();
  const month = parts.month.trim();
  const year = parts.year.trim();
  if (day.length !== 2 || month.length !== 2 || year.length !== 4) return '';
  return `${year}-${month}-${day}`;
}

/** Validates a DOB ISO string: real calendar date, not future, not before 1900. */
export function isValidDobIso(iso: string, at: Date = new Date()): boolean {
  const t = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  if (t < '1900-01-01') return false;
  if (!isIsoDateNotAfterToday(t, at)) return false;
  const [y, m, d] = t.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m! - 1 &&
    dt.getDate() === d
  );
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function dobYearOptions(at: Date = new Date()): number[] {
  const current = at.getFullYear();
  const years: number[] = [];
  for (let y = current; y >= 1900; y -= 1) years.push(y);
  return years;
}

export function dobMonthOptions(): { value: string; label: string }[] {
  return [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' }
  ];
}

export function dobDayOptions(year: string, month: string): string[] {
  const y = Number(year);
  const m = Number(month);
  if (!year || !month || !Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return Array.from({ length: 31 }, (_, i) => pad2(i + 1));
  }
  const count = daysInMonth(y, m);
  return Array.from({ length: count }, (_, i) => pad2(i + 1));
}

/** Completed years of age from a valid DOB ISO string, or null when invalid. */
export function ageFromDobIso(iso: string, at: Date = new Date()): number | null {
  if (!isValidDobIso(iso, at)) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const atYear = at.getFullYear();
  const atMonth = at.getMonth() + 1;
  const atDay = at.getDate();
  let age = atYear - y!;
  if (atMonth < m! || (atMonth === m! && atDay < d!)) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

/** Error when token/booking amount exceeds the unit sale total (negotiated or catalog). */
export function bookingAmountExceedsUnitTotalMessage(
  bookingAmountInr: number,
  unitTotalInr: number
): string | null {
  const total = Math.round(Number(unitTotalInr) || 0);
  if (total <= 0) return null;
  const amount = Math.round(Number(bookingAmountInr) || 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (amount > total) {
    return `Booking amount cannot exceed unit total (₹ ${total.toLocaleString('en-IN')}).`;
  }
  return null;
}

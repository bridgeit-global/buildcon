export type RefundPolicyInput = {
  totalCollectedInr: number;
  /** Percentage retained by developer (default 10%). */
  deductionPct?: number;
  /** Optional flat minimum deduction in INR. */
  minimumDeductionInr?: number;
};

export type RefundCalculation = {
  totalCollectedInr: number;
  deductionPct: number;
  deductionAmountInr: number;
  refundAmountInr: number;
  policyNotes: string;
};

const DEFAULT_DEDUCTION_PCT = 10;

/**
 * Standard cancellation refund: collected amount minus retention %.
 * Token forfeiture can apply when nothing was collected beyond token.
 */
export function calculateBookingRefund(
  input: RefundPolicyInput
): RefundCalculation {
  const total = Math.max(0, Number(input.totalCollectedInr) || 0);
  const pct = Math.min(
    100,
    Math.max(0, Number(input.deductionPct ?? DEFAULT_DEDUCTION_PCT) || 0)
  );
  let deduction = Number(((total * pct) / 100).toFixed(2));
  const minDed = Math.max(0, Number(input.minimumDeductionInr) || 0);
  if (minDed > 0 && total > 0) {
    deduction = Math.max(deduction, Math.min(minDed, total));
  }
  const refund = Math.max(0, Number((total - deduction).toFixed(2)));
  const policyNotes =
    total <= 0
      ? 'No collections recorded; refund amount is zero.'
      : `${pct}% retention (${deduction.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}) per standard cancellation policy.`;

  return {
    totalCollectedInr: total,
    deductionPct: pct,
    deductionAmountInr: deduction,
    refundAmountInr: refund,
    policyNotes
  };
}

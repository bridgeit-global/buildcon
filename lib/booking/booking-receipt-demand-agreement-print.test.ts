import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildBookingReceiptHtml,
  buildDemandLetterHtml,
  buildSaleAgreementHtml,
  display,
  esc,
  formatInr,
  formatPrintDate,
  sharedStyles,
  unitLine,
  type BookingSalesDocPrintBase
} from './booking-receipt-demand-agreement-print';

const FIXED_AT = new Date('2026-06-15T05:00:00+05:30');

const salesDocBase: BookingSalesDocPrintBase = {
  bookingId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  bookingCreatedAt: '2026-01-10',
  projectName: 'Sunrise Heights',
  projectLocation: 'Pune, Maharashtra',
  unitCode: 'A-101',
  wingName: 'Tower A',
  floor: 12,
  unitType: '3 BHK',
  customerName: 'Ravi Kumar',
  coBuyerNames: ['Priya Kumar'],
  bookingAmount: 7_500_000,
  workflowStage: 'Agreement',
  paymentMode: 'NEFT',
  receivedAmount: 500_000,
  receivedAt: '2026-06-01',
  paymentReference: 'NEFT-REF-001',
  instalmentLabel: 'Booking amount',
  demandAmount: 1_000_000,
  demandDueDate: '2026-07-01',
  generatedAt: FIXED_AT
};

describe('helpers', () => {
  it('escapes HTML entities', () => {
    expect(esc('<script>"x"</script>')).toBe('&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
  });

  it('formats display fallbacks', () => {
    expect(display('  ')).toBe('—');
    expect(display(' Pune ')).toBe('Pune');
  });

  it('formats INR amounts', () => {
    expect(formatInr(1234567)).toBe('₹ 12,34,567');
    expect(formatInr(null)).toBe('—');
  });

  it('builds unit line from parts', () => {
    expect(unitLine(salesDocBase)).toBe('A-101 · Wing Tower A · Floor 12 · 3 BHK');
  });

  it('includes shared print styles', () => {
    expect(sharedStyles()).toContain('@page');
  });

  it('formats print dates', () => {
    expect(formatPrintDate(FIXED_AT)).toBe('15-06-2026');
  });
});

describe('print HTML snapshots', () => {
  beforeAll(() => {
    process.env.TZ = 'Asia/Kolkata';
  });

  it('buildBookingReceiptHtml', () => {
    expect(buildBookingReceiptHtml(salesDocBase)).toMatchSnapshot();
  });

  it('buildDemandLetterHtml', () => {
    expect(buildDemandLetterHtml(salesDocBase)).toMatchSnapshot();
  });

  it('buildSaleAgreementHtml', () => {
    expect(buildSaleAgreementHtml(salesDocBase)).toMatchSnapshot();
  });
});

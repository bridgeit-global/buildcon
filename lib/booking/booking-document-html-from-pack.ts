import type { BookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import type { BookingDocumentPrintKind } from '@/lib/booking/record-booking-document-print';
import { buildAllotmentLetterHtml } from '@/lib/booking/allotment-letter-print';
import { buildApplicationFormHtml } from '@/lib/booking/application-form-print';
import {
  buildBookingReceiptHtml,
  buildDemandLetterHtml,
  buildSaleAgreementHtml,
  type BookingSalesDocPrintBase
} from '@/lib/booking/booking-receipt-demand-agreement-print';
import { buildRegistrationDeedHtml } from '@/lib/booking/registration-deed-print';
import { buildPossessionLetterHtml } from '@/lib/booking/possession-letter-print';
import {
  buildApplicantRows,
  formatCustomerAddress,
  pickCustomerAddress
} from '@/lib/customer/application-form-data';
import type { CoBuyerStored } from '@/app/crm/bookings/booking-types';

function unwrapJoin<T>(x: T | T[] | null): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export type BookingDocumentHtmlOverrides = Partial<
  Pick<
    BookingSalesDocPrintBase,
    | 'receivedAmount'
    | 'receivedAt'
    | 'paymentReference'
    | 'paymentMode'
    | 'instalmentLabel'
    | 'demandAmount'
    | 'demandDueDate'
    | 'generatedAt'
  >
>;

function salesDocBaseFromPack(
  pack: BookingPrintPack,
  overrides?: BookingDocumentHtmlOverrides
): BookingSalesDocPrintBase {
  const booking = pack.booking;
  const unit = unwrapJoin(booking.units);
  const customer = unwrapJoin(booking.customers);
  const co = (booking.co_buyers ?? []) as CoBuyerStored[];
  return {
    bookingId: booking.id,
    bookingCreatedAt: booking.created_at,
    projectName: pack.projectName,
    projectLocation: pack.projectLocation,
    unitCode: unit?.unit_code ?? null,
    wingName: unit?.wing_name ?? null,
    floor: unit?.floor ?? null,
    unitType: unit?.unit_type ?? null,
    customerName: customer?.full_name ?? null,
    coBuyerNames: co.map((c) => c.full_name).filter(Boolean),
    bookingAmount: booking.booking_amount,
    workflowStage: booking.workflow_stage,
    paymentMode: pack.stageData.token?.mode ?? booking.payment_mode ?? null,
    ...overrides
  };
}

/** Printable HTML for a booking-backed document (same content as print preview). */
export function buildBookingDocumentHtmlFromPack(
  kind: BookingDocumentPrintKind,
  pack: BookingPrintPack,
  overrides?: BookingDocumentHtmlOverrides
): string {
  switch (kind) {
    case 'receipt':
      return buildBookingReceiptHtml(salesDocBaseFromPack(pack, overrides));
    case 'demand-letter':
      return buildDemandLetterHtml(salesDocBaseFromPack(pack, overrides));
    case 'agreement':
      return buildSaleAgreementHtml(salesDocBaseFromPack(pack, overrides));
    case 'application-form': {
      const booking = pack.booking;
      const unit = unwrapJoin(booking.units);
      const buyers = pack.buyerKyc.map((b) => ({ id: b.customerId, label: b.label }));
      const applicants = buildApplicantRows(buyers, pack.buyerProfiles, pack.buyerAddresses);
      return buildApplicationFormHtml({
        applicationFormNo: booking.id,
        projectName: pack.projectName,
        projectLocation: pack.projectLocation,
        unitCode: unit?.unit_code ?? null,
        wingName: unit?.wing_name ?? null,
        floor: unit?.floor ?? null,
        unitType: unit?.unit_type ?? null,
        bookingAmount: booking.booking_amount,
        paymentMode: pack.stageData.token?.mode ?? booking.payment_mode ?? null,
        tokenDate: pack.stageData.token?.date ?? null,
        tokenReference: pack.stageData.token?.reference ?? null,
        loanFromBank: Boolean(booking.loan_bank),
        preferredBank: booking.loan_bank,
        applicants
      });
    }
    case 'registration-deed':
      return buildRegistrationDeedHtml(salesDocBaseFromPack(pack, overrides));
    case 'possession-letter':
      return buildPossessionLetterHtml(salesDocBaseFromPack(pack, overrides));
    case 'allotment-letter': {
      const booking = pack.booking;
      const unit = unwrapJoin(booking.units);
      const customer = unwrapJoin(booking.customers);
      const co = (booking.co_buyers ?? []) as CoBuyerStored[];
      const primaryAddr = pickCustomerAddress(
        pack.buyerAddresses.get(booking.customer_id) ?? [],
        'current'
      );
      return buildAllotmentLetterHtml({
        letterRef: pack.stageData.allotment?.allotment_letter_ref,
        allotmentDate: pack.stageData.allotment?.allotment_date,
        projectName: pack.projectName,
        projectLocation: pack.projectLocation,
        unitCode: unit?.unit_code ?? null,
        wingName: unit?.wing_name ?? null,
        floor: unit?.floor ?? null,
        unitType: unit?.unit_type ?? null,
        bookingId: booking.id,
        bookingCreatedAt: booking.created_at,
        bookingAmount: booking.booking_amount,
        customerName: customer?.full_name ?? null,
        coBuyerNames: co.map((c) => c.full_name).filter(Boolean),
        customerAddress: formatCustomerAddress(primaryAddr) || null
      });
    }
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown document kind: ${_exhaustive}`);
    }
  }
}

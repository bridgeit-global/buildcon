import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BookingDetailRow,
  BookingStageData,
  CoBuyerStored
} from '@/app/crm/bookings/booking-types';
import { formatCustomerAddress, pickCustomerAddress } from '@/lib/customer/application-form-data';
import {
  buildApplicantRows,
  type CustomerAddressSnippet,
  type CustomerApplicationProfile
} from '@/lib/customer/application-form-data';
import { isCustomerKycComplete } from '@/lib/customer/kyc-identifiers';
import { printAllotmentLetter } from '@/lib/booking/allotment-letter-print';
import { printApplicationForm } from '@/lib/booking/application-form-print';
import {
  printBookingReceipt,
  printDemandLetter,
  printSaleAgreement
} from '@/lib/booking/booking-receipt-demand-agreement-print';

function unwrapJoin<T>(x: T | T[] | null): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export type PrintPackBuyerKyc = {
  customerId: string;
  label: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  occupation: string | null;
  pan: string;
  aadhaarLast4: string;
  hasPanDoc: boolean;
  hasAadhaarDoc: boolean;
  hasPhotoDoc: boolean;
};

export type BookingPrintPack = {
  booking: BookingDetailRow;
  projectName: string | null;
  projectLocation: string | null;
  stageData: BookingStageData;
  buyerKyc: PrintPackBuyerKyc[];
  buyerProfiles: Map<string, CustomerApplicationProfile>;
  buyerAddresses: Map<string, CustomerAddressSnippet[]>;
  /** Ordered photo storage paths matching buyerKyc order (null when no photo uploaded). */
  buyerPhotoStoragePaths: (string | null)[];
  kycComplete: boolean;
};

/**
 * Loads booking + buyer/project context needed for printable booking documents
 * (receipt, demand letter, agreement, application form, allotment letter).
 * Mirrors the booking detail page `load()` merge rules for application address fields.
 */
export async function loadBookingPrintPack(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{ ok: true; pack: BookingPrintPack } | { ok: false; error: string }> {
  const { data, error: qErr } = await supabase
    .from('bookings')
    .select(
      `
        id, project_id, unit_id, customer_id, sales_inquiry_id,
        created_at, updated_at, stage, workflow_stage, status,
        payment_mode, loan_bank, booking_amount, co_buyers, payment_detail, stage_data,
        units ( unit_code, wing_name, floor, unit_type, status ),
        customers ( full_name, phone, email, occupation, pan_number, aadhaar_last4 )
      `
    )
    .eq('id', bookingId)
    .maybeSingle();

  if (qErr) return { ok: false, error: qErr.message };
  if (!data) return { ok: false, error: 'Booking not found' };

  const row = data as unknown as BookingDetailRow;
  const stage = (row.stage_data ?? {}) as BookingStageData;
  const primary = unwrapJoin(row.customers);

  const [{ data: projectRow }, { data: addrRows }] = await Promise.all([
    supabase
      .from('projects')
      .select('name, location')
      .eq('id', row.project_id)
      .maybeSingle(),
    supabase
      .from('customer_addresses')
      .select('kind,address_line1,city,state,pin')
      .eq('customer_id', row.customer_id)
      .order('created_at', { ascending: true })
  ]);

  const currentAddr =
    (addrRows ?? []).find((a) => a.kind === 'current') ?? addrRows?.[0];
  const app = stage.application ?? {};
  const stageData: BookingStageData = {
    ...stage,
    application: {
      ...app,
      occupation: app.occupation || primary?.occupation || undefined,
      address_line1:
        app.address_line1 || (currentAddr?.address_line1 as string) || undefined,
      city: app.city || (currentAddr?.city as string) || undefined,
      state: app.state || (currentAddr?.state as string) || undefined,
      pin: app.pin || (currentAddr?.pin as string) || undefined
    }
  };

  const co = (row.co_buyers ?? []) as CoBuyerStored[];
  const buyerIds = [
    { id: row.customer_id, label: primary?.full_name ?? 'Primary buyer' },
    ...co.map((c) => ({
      id: c.customer_id,
      label: c.full_name || 'Co-applicant'
    }))
  ];

  const { data: kycRows } = await supabase
    .from('customer_kyc_documents')
    .select('customer_id,doc_type,storage_path')
    .in(
      'customer_id',
      buyerIds.map((b) => b.id)
    );

  const buyerIdList = buyerIds.map((b) => b.id);

  const [{ data: custRows }, { data: allAddrRows }] = await Promise.all([
    supabase
      .from('customers')
      .select(
        'id,full_name,phone,email,dob,occupation,nationality,pan_number,aadhaar_last4,guardian_name,residential_status,passport_number,office_name_address'
      )
      .in('id', buyerIdList),
    supabase
      .from('customer_addresses')
      .select('customer_id,kind,address_line1,city,state,pin')
      .in('customer_id', buyerIdList)
  ]);

  const custById = new Map((custRows ?? []).map((c) => [c.id as string, c]));
  const profiles = new Map<string, CustomerApplicationProfile>();
  for (const c of custRows ?? []) {
    profiles.set(c.id as string, c as CustomerApplicationProfile);
  }

  const addrByCustomer = new Map<string, CustomerAddressSnippet[]>();
  for (const ar of allAddrRows ?? []) {
    const cid = ar.customer_id as string;
    if (!addrByCustomer.has(cid)) addrByCustomer.set(cid, []);
    addrByCustomer.get(cid)!.push({
      kind: String(ar.kind),
      address_line1: ar.address_line1 as string | null,
      city: ar.city as string | null,
      state: ar.state as string | null,
      pin: ar.pin as string | null
    });
  }

  const docsByCustomer = new Map<string, Set<string>>();
  const photoPathByCustomer = new Map<string, string>();
  for (const doc of kycRows ?? []) {
    const cid = doc.customer_id as string;
    if (!docsByCustomer.has(cid)) docsByCustomer.set(cid, new Set());
    docsByCustomer.get(cid)!.add(String(doc.doc_type));
    if (String(doc.doc_type) === 'photo' && doc.storage_path) {
      photoPathByCustomer.set(cid, String(doc.storage_path));
    }
  }

  const buyerKyc: PrintPackBuyerKyc[] = buyerIds.map((b) => {
    const c = custById.get(b.id);
    const docs = docsByCustomer.get(b.id) ?? new Set();
    return {
      customerId: b.id,
      label: b.label,
      fullName: String(c?.full_name ?? b.label),
      phone: (c?.phone as string | null) ?? null,
      email: (c?.email as string | null) ?? null,
      occupation: (c?.occupation as string | null) ?? null,
      pan: String(c?.pan_number ?? ''),
      aadhaarLast4: String(c?.aadhaar_last4 ?? ''),
      hasPanDoc: docs.has('pan'),
      hasAadhaarDoc: docs.has('aadhaar'),
      hasPhotoDoc: docs.has('photo')
    };
  });

  const kycComplete = buyerKyc.every((b) =>
    isCustomerKycComplete(b.pan, b.aadhaarLast4, [
      ...(b.hasPanDoc ? ['pan'] : []),
      ...(b.hasAadhaarDoc ? ['aadhaar'] : []),
      ...(b.hasPhotoDoc ? ['photo'] : [])
    ])
  );

  const buyerPhotoStoragePaths = buyerIds.map((b) => photoPathByCustomer.get(b.id) ?? null);

  return {
    ok: true,
    pack: {
      booking: row,
      projectName: (projectRow?.name as string) ?? null,
      projectLocation: (projectRow?.location as string) ?? null,
      stageData,
      buyerKyc,
      buyerProfiles: profiles,
      buyerAddresses: addrByCustomer,
      buyerPhotoStoragePaths,
      kycComplete
    }
  };
}

export function printAllotmentLetterFromPack(pack: BookingPrintPack): void {
  const booking = pack.booking;
  const unit = unwrapJoin(booking.units);
  const customer = unwrapJoin(booking.customers);
  const co = (booking.co_buyers ?? []) as CoBuyerStored[];
  const primaryAddr = pickCustomerAddress(
    pack.buyerAddresses.get(booking.customer_id) ?? [],
    'current'
  );
  printAllotmentLetter({
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

function salesDocBaseFromPack(pack: BookingPrintPack) {
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
    paymentMode: pack.stageData.token?.mode ?? booking.payment_mode ?? null
  };
}

export function printReceiptFromPack(pack: BookingPrintPack): void {
  printBookingReceipt(salesDocBaseFromPack(pack));
}

export function printDemandLetterFromPack(pack: BookingPrintPack): void {
  printDemandLetter(salesDocBaseFromPack(pack));
}

export function printAgreementFromPack(pack: BookingPrintPack): void {
  printSaleAgreement(salesDocBaseFromPack(pack));
}

export function printApplicationFormFromPack(pack: BookingPrintPack): void {
  if (!pack.kycComplete) {
    throw new Error(
      'Complete KYC for all applicants (PAN, 12-digit Aadhaar, and PAN, Aadhaar, and photo uploads) on the Customers page before generating the application form.'
    );
  }
  const booking = pack.booking;
  const unit = unwrapJoin(booking.units);
  const buyers = pack.buyerKyc.map((b) => ({ id: b.customerId, label: b.label }));
  const applicants = buildApplicantRows(buyers, pack.buyerProfiles, pack.buyerAddresses);
  printApplicationForm({
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

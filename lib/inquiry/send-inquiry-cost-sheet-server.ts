import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeBookingCostBreakdown,
  type ProjectParkingMeta,
  type ProjectPricingMeta,
  type UnitCostInput
} from '@/app/crm/booking-cost-utils';
import { renderHtmlToPdfBuffer } from '@/lib/booking/html-to-pdf';
import { buildCostSheetHtml } from '@/lib/inquiry/cost-sheet-print';
import { inquiryCostSheetStoragePath } from '@/lib/inquiry/inquiry-cost-sheet-storage-path';
import { loadBrandLogoDataUri } from '@/lib/organization/brand-logo';
import { fetchOrganizationSettings } from '@/lib/organization/fetch-organization-settings';
import { resolveDeveloperTradeName } from '@/lib/organization/organization-settings';
import {
  dispatchDocumentToRecipient,
  type DispatchNotificationResult
} from '@/lib/notifications/dispatch-notification';
import type { NotificationRecipient } from '@/lib/notifications/notification-templates';
import { phoneToWaDigits } from '@/lib/notifications/meta-cloud-whatsapp';

const SIGNED_URL_VALID_DAYS = 7;
const SIGNED_URL_VALID_SECONDS = SIGNED_URL_VALID_DAYS * 24 * 60 * 60;
const COST_SHEET_DOC_LABEL = 'Cost sheet';

export type SendInquiryCostSheetInput = {
  inquiryId: string;
  unitId: string;
  parkingRequired: 'Yes' | 'No';
  parkingCount: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  generatedBy?: string | null;
  preferShareLink?: boolean;
};

type UnitDbRow = {
  id: string;
  project_id: string;
  unit_code: string;
  wing_name: string | null;
  floor: number | null;
  unit_no: number | null;
  unit_type: string | null;
  area: number | null;
  carpet_area: number | null;
  bua_area: number | null;
  rate: number | null;
  floor_rise_charge: number | null;
  plc_charge: number | null;
  parking_slots_included: number | null;
  status: string | null;
  projects?: { name?: string | null } | { name?: string | null }[] | null;
};

function unitFromDb(row: UnitDbRow): UnitCostInput {
  const pr = row.projects;
  const project =
    Array.isArray(pr) ? pr[0] : pr && typeof pr === 'object' ? pr : null;
  return {
    unit_code: row.unit_code,
    wing_name: row.wing_name ?? '',
    floor: Number(row.floor) || 0,
    unit_no: row.unit_no,
    project_name: project?.name ?? null,
    unit_type: row.unit_type,
    area: row.area,
    carpet_area: row.carpet_area,
    bua_area: row.bua_area,
    rate: row.rate,
    floor_rise_charge: row.floor_rise_charge,
    plc_charge: row.plc_charge,
    parking_slots_included: row.parking_slots_included,
    status: row.status ?? ''
  };
}

function pricingFromProject(row: Record<string, unknown>): ProjectPricingMeta {
  return {
    gst_registered: Boolean(row.pricing_gst_registered),
    gst_percent: Number(row.pricing_gst_percent) || 0,
    stamp_duty_percent: Number(row.pricing_stamp_duty_percent) || 0,
    registration_fee: Number(row.pricing_registration_fee) || 0
  };
}

function parkingFromProject(row: Record<string, unknown>): ProjectParkingMeta {
  return {
    parking_slots:
      row.parking_slots != null ? Number(row.parking_slots) : null,
    parking_rate: row.parking_rate != null ? Number(row.parking_rate) : null
  };
}

async function signDocumentUrl(
  admin: SupabaseClient,
  storagePath: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!storagePath.startsWith('documents/')) {
    return { ok: false, error: 'Document is not stored in the documents bucket.' };
  }
  const { data, error } = await admin.storage
    .from('documents')
    .createSignedUrl(storagePath, SIGNED_URL_VALID_SECONDS);
  if (error || !data?.signedUrl) {
    return { ok: false, error: 'Could not sign download URL.' };
  }
  return { ok: true, url: data.signedUrl };
}

/** Generates a cost sheet PDF, records quotation + generated document, and notifies the customer. */
export async function sendInquiryCostSheetServer(
  admin: SupabaseClient,
  input: SendInquiryCostSheetInput
): Promise<
  | { ok: true; generatedDocumentId: string; dispatch: DispatchNotificationResult }
  | { ok: false; error: string }
> {
  const inquiryId = String(input.inquiryId || '').trim();
  const unitId = String(input.unitId || '').trim();
  if (!inquiryId || !unitId) {
    return { ok: false, error: 'Inquiry and unit are required.' };
  }

  const { data: inquiry, error: inqErr } = await admin
    .from('sales_inquiries')
    .select('id, project_id, customer_id, customers(full_name, email, phone)')
    .eq('id', inquiryId)
    .maybeSingle();

  if (inqErr) return { ok: false, error: 'Could not load enquiry.' };
  if (!inquiry) return { ok: false, error: 'Inquiry not found' };

  const projectId = String(inquiry.project_id || '').trim();
  const customerId = String(inquiry.customer_id || '').trim() || null;
  if (!customerId) {
    return {
      ok: false,
      error: 'Save the enquiry with customer details before sending the cost sheet.'
    };
  }
  const customerRel = (inquiry as { customers?: unknown }).customers;
  const customerRow = Array.isArray(customerRel)
    ? customerRel[0]
    : customerRel && typeof customerRel === 'object'
      ? customerRel
      : null;
  const dbCustomer = customerRow as
    | { full_name?: string | null; email?: string | null; phone?: string | null }
    | null;

  const fullName =
    String(input.customerName || dbCustomer?.full_name || '').trim() || 'Customer';
  const email =
    String(input.customerEmail || dbCustomer?.email || '').trim() || null;
  const phone =
    String(input.customerPhone || dbCustomer?.phone || '').trim() || null;

  if (!phone && !email) {
    return {
      ok: false,
      error: 'Add the customer mobile number or email before sending the cost sheet.'
    };
  }

  const { data: unitRow, error: unitErr } = await admin
    .from('units')
    .select(
      'id, project_id, unit_code, wing_name, floor, unit_no, unit_type, area, carpet_area, bua_area, rate, floor_rise_charge, plc_charge, parking_slots_included, status, projects(name)'
    )
    .eq('id', unitId)
    .maybeSingle();

  if (unitErr) return { ok: false, error: 'Could not load unit.' };
  if (!unitRow) return { ok: false, error: 'Unit not found' };
  if (String(unitRow.project_id) !== projectId) {
    return { ok: false, error: 'Unit does not belong to this enquiry project.' };
  }

  const { data: projectRow, error: projErr } = await admin
    .from('projects')
    .select(
      'parking_slots,parking_rate,pricing_gst_registered,pricing_gst_percent,pricing_stamp_duty_percent,pricing_registration_fee'
    )
    .eq('id', projectId)
    .maybeSingle();

  if (projErr) return { ok: false, error: 'Could not load project.' };
  if (!projectRow) return { ok: false, error: 'Project not found' };

  const unit = unitFromDb(unitRow as UnitDbRow);
  const projectParking = parkingFromProject(projectRow as Record<string, unknown>);
  const projectPricing = pricingFromProject(projectRow as Record<string, unknown>);
  const slotRate =
    projectParking.parking_rate != null && projectParking.parking_rate > 0
      ? projectParking.parking_rate
      : 0;

  const breakdown = computeBookingCostBreakdown(
    unit,
    input.parkingRequired,
    input.parkingCount,
    slotRate,
    projectParking,
    projectPricing,
    { applyDefaultGst: !projectPricing.gst_registered }
  );

  const org = await fetchOrganizationSettings(admin);
  const developerName = resolveDeveloperTradeName(org?.trade_name);
  const logoDataUri = await loadBrandLogoDataUri(admin, org?.logo_storage_path);
  const html = buildCostSheetHtml({
    unit,
    parkingRequired: input.parkingRequired,
    parkingCount: input.parkingCount,
    projectParking,
    projectPricing,
    customerName: fullName,
    developerName,
    logoDataUri
  });

  let pdf: Buffer;
  try {
    pdf = await renderHtmlToPdfBuffer(html);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'PDF rendering failed'
    };
  }

  const fileId = crypto.randomUUID();
  const storagePath = inquiryCostSheetStoragePath({
    projectId,
    inquiryId,
    unitId,
    fileId
  });

  const { error: upErr } = await admin.storage.from('documents').upload(storagePath, pdf, {
    contentType: 'application/pdf',
    upsert: false
  });
  if (upErr) return { ok: false, error: 'Could not save the cost sheet PDF.' };

  const { data: genRow, error: genErr } = await admin
    .from('generated_documents')
    .insert({
      project_id: projectId,
      booking_id: null,
      customer_id: customerId,
      template_id: null,
      storage_path: storagePath,
      generated_by: input.generatedBy ?? null
    })
    .select('id')
    .maybeSingle();

  if (genErr || !genRow?.id) {
    return {
      ok: false,
      error: 'Could not save generated document record.'
    };
  }

  const gstAmount = breakdown.gstAmountInr;
  const stampAmount = breakdown.stampDutyEstimateInr;
  const regAmount = breakdown.registrationEstimateInr;

  const { error: quoteErr } = await admin.from('quotations').insert({
    project_id: projectId,
    customer_id: customerId,
    unit_id: unitId,
    sales_inquiry_id: inquiryId,
    status: 'sent',
    agreement_value_basic: breakdown.basicInr,
    parking_amount: breakdown.parkingExtraInr,
    gst_amount: gstAmount,
    stamp_duty_estimate: stampAmount,
    registration_estimate: regAmount,
    discount_amount: 0,
    grand_total: breakdown.grandTotalInr,
    notes: null,
    payload: {
      parkingRequired: input.parkingRequired,
      parkingCount: input.parkingCount,
      generatedDocumentId: genRow.id,
      storagePath
    },
    created_by: input.generatedBy ?? null
  });

  if (quoteErr) {
    return { ok: false, error: 'Could not save quotation record.' };
  }

  const signed = await signDocumentUrl(admin, storagePath);
  if (!signed.ok) return { ok: false, error: signed.error };

  const recipient: NotificationRecipient = {
    fullName,
    email,
    phoneE164Digits: phoneToWaDigits(phone)
  };

  const fileName = `Cost-sheet-${unit.unit_code}.pdf`;

  const dispatch = await dispatchDocumentToRecipient(
    admin,
    {
      generatedDocumentId: genRow.id as string,
      projectId,
      bookingId: null,
      unitId,
      customerId,
      recipient,
      customerPhoneRaw: phone,
      docCtx: {
        kind: 'application-form',
        docLabel: COST_SHEET_DOC_LABEL,
        signedUrl: signed.url,
        signedUrlValidDays: SIGNED_URL_VALID_DAYS,
        fileName,
        unitCode: unit.unit_code,
        projectName: unit.project_name ?? null
      }
    },
    { preferShareLink: input.preferShareLink === true }
  );

  return {
    ok: true,
    generatedDocumentId: genRow.id as string,
    dispatch
  };
}

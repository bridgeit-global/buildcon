import type { SupabaseClient } from '@supabase/supabase-js';
import {
  negotiatedPriceFromInquiryStage,
  resolveBookingFinancialTotal
} from '@/app/crm/booking-financial-total';
import {
  computeBookingCostBreakdown,
  type ProjectParkingMeta,
  type ProjectPricingMeta,
  type UnitCostInput
} from '@/app/crm/booking-cost-utils';
import { unitAgreementTotalInr } from '@/app/crm/inr-format';

/** Catalog sale value (incl. GST / parking when inferable) before negotiation override. */
export async function resolveCatalogTotalInrForBooking(
  admin: SupabaseClient,
  opts: { unitId: string; projectId: string }
): Promise<number> {
  const [{ data: unit, error: uErr }, { data: project, error: pErr }] =
    await Promise.all([
      admin
        .from('units')
        .select(
          'unit_code,wing_name,floor,unit_no,unit_type,area,carpet_area,bua_area,rate,floor_rise_charge,plc_charge,parking_slots_included,status'
        )
        .eq('id', opts.unitId)
        .maybeSingle(),
      admin
        .from('projects')
        .select(
          'parking_slots,parking_rate,pricing_gst_registered,pricing_gst_percent,pricing_stamp_duty_percent,pricing_registration_fee'
        )
        .eq('id', opts.projectId)
        .maybeSingle()
    ]);
  if (uErr) throw new Error(uErr.message);
  if (pErr) throw new Error(pErr.message);
  if (!unit) return 0;

  const unitInput = unit as UnitCostInput;
  const projectParking: ProjectParkingMeta | null = project
    ? {
        parking_slots: project.parking_slots as number | null,
        parking_rate: project.parking_rate as number | null
      }
    : null;
  const pd = project as Record<string, unknown> | null;
  const projectPricing: ProjectPricingMeta | undefined = pd
    ? {
        gst_registered: Boolean(pd.pricing_gst_registered),
        gst_percent: Number(pd.pricing_gst_percent) || 0,
        stamp_duty_percent: Number(pd.pricing_stamp_duty_percent) || 0,
        registration_fee: Number(pd.pricing_registration_fee) || 0
      }
    : undefined;

  const breakdown = computeBookingCostBreakdown(
    unitInput,
    'No',
    '1',
    projectParking?.parking_rate ?? null,
    projectParking,
    projectPricing,
    { applyDefaultGst: !projectPricing?.gst_registered }
  );

  if (breakdown.grandTotalInr > 0) return Math.round(breakdown.grandTotalInr);

  const dwelling = unitAgreementTotalInr(unitInput);
  if (dwelling <= 0) return 0;
  const gst = projectPricing?.gst_registered
    ? Math.round((dwelling * (projectPricing.gst_percent || 0)) / 100)
    : Math.round(dwelling * 0.05);
  return dwelling + gst;
}

/** Final unit sale amount: negotiated deal price when set, else catalog total. */
export async function resolveSaleTotalInrForBooking(
  admin: SupabaseClient,
  opts: {
    unitId: string;
    projectId: string;
    salesInquiryId?: string | null;
    /** Client-computed total at booking time (incl. parking / GST). */
    saleTotalInr?: number | null;
  }
): Promise<number> {
  if (opts.saleTotalInr != null && opts.saleTotalInr > 0) {
    return Math.round(opts.saleTotalInr);
  }

  const [catalog, negotiated] = await Promise.all([
    resolveCatalogTotalInrForBooking(admin, {
      unitId: opts.unitId,
      projectId: opts.projectId
    }),
    opts.salesInquiryId
      ? loadNegotiatedFromInquiry(admin, opts.salesInquiryId)
      : Promise.resolve(null)
  ]);

  return resolveBookingFinancialTotal(catalog, negotiated).financialTotalInr;
}

async function loadNegotiatedFromInquiry(
  admin: SupabaseClient,
  salesInquiryId: string
): Promise<number | null> {
  const { data, error } = await admin
    .from('sales_inquiries')
    .select('stage_data')
    .eq('id', salesInquiryId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return negotiatedPriceFromInquiryStage(
    (data?.stage_data as Record<string, unknown> | null) ?? null
  );
}

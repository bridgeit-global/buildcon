import type { SupabaseClient } from '@supabase/supabase-js';
import { negotiatedPriceFromInquiryStage } from '@/app/crm/booking-financial-total';
import { unitAgreementTotalInr, type UnitPricingInput } from '@/app/crm/inr-format';

type CldStageRow = {
  sort_order: number;
  name: string;
  demand_kind: string;
  demand_value: number;
  slab_label: string | null;
};

export type PaymentScheduleInsertRow = {
  booking_id: string;
  instalment_no: number;
  milestone: string;
  due_date: string;
  amount: number;
};

function addDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function milestoneLabel(stage: CldStageRow) {
  const slab = stage.slab_label?.trim();
  return slab ? `${stage.name} (${slab})` : stage.name;
}

function stageDemandAmount(
  stage: CldStageRow,
  agreementTotalInr: number,
  instalmentNo: number,
  bookingAmount: number
) {
  if (instalmentNo === 1 && bookingAmount > 0) {
    return bookingAmount;
  }
  if (stage.demand_kind === 'fixed') {
    return Math.max(0, Math.round(Number(stage.demand_value) || 0));
  }
  const pct = Number(stage.demand_value) || 0;
  return Math.max(0, Math.round((agreementTotalInr * pct) / 100));
}

function fallbackScheduleRows(
  bookingId: string,
  bookingAmount: number
): PaymentScheduleInsertRow[] {
  return [
    {
      booking_id: bookingId,
      instalment_no: 1,
      milestone: 'Booking Amount',
      due_date: addDaysISO(0),
      amount: bookingAmount
    },
    {
      booking_id: bookingId,
      instalment_no: 2,
      milestone: 'Allotment',
      due_date: addDaysISO(30),
      amount: 0
    },
    {
      booking_id: bookingId,
      instalment_no: 3,
      milestone: 'Plinth Completed',
      due_date: addDaysISO(60),
      amount: 0
    },
    {
      booking_id: bookingId,
      instalment_no: 4,
      milestone: '1st Slab Completed',
      due_date: addDaysISO(90),
      amount: 0
    },
    {
      booking_id: bookingId,
      instalment_no: 5,
      milestone: '3rd Slab Completed',
      due_date: addDaysISO(120),
      amount: 0
    },
    {
      booking_id: bookingId,
      instalment_no: 6,
      milestone: 'Brickwork Completed',
      due_date: addDaysISO(150),
      amount: 0
    },
    {
      booking_id: bookingId,
      instalment_no: 7,
      milestone: 'Possession',
      due_date: addDaysISO(180),
      amount: 0
    }
  ];
}

export function buildPaymentScheduleRows(
  stages: CldStageRow[],
  bookingId: string,
  agreementTotalInr: number,
  bookingAmount: number
): PaymentScheduleInsertRow[] {
  if (!stages.length) {
    return fallbackScheduleRows(bookingId, bookingAmount);
  }

  const ordered = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  return ordered.map((stage, index) => {
    const instalmentNo = index + 1;
    return {
      booking_id: bookingId,
      instalment_no: instalmentNo,
      milestone: milestoneLabel(stage),
      due_date: addDaysISO(index * 30),
      amount: stageDemandAmount(
        stage,
        agreementTotalInr,
        instalmentNo,
        bookingAmount
      )
    };
  });
}

async function loadNegotiatedTotalFromInquiry(
  admin: SupabaseClient,
  salesInquiryId: string | null | undefined
): Promise<number | null> {
  const inquiryId = String(salesInquiryId ?? '').trim();
  if (!inquiryId) return null;
  const { data, error } = await admin
    .from('sales_inquiries')
    .select('stage_data')
    .eq('id', inquiryId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return negotiatedPriceFromInquiryStage(
    (data?.stage_data as Record<string, unknown> | null) ?? null
  );
}

async function loadAgreementTotalInr(
  admin: SupabaseClient,
  unitId: string
): Promise<number> {
  const { data, error } = await admin
    .from('units')
    .select('area,carpet_area,bua_area,rate,floor_rise_charge,plc_charge')
    .eq('id', unitId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return 0;
  return unitAgreementTotalInr(data as UnitPricingInput);
}

async function loadProjectCldStages(
  admin: SupabaseClient,
  projectId: string
): Promise<CldStageRow[]> {
  const { data, error } = await admin
    .from('project_cld_stages')
    .select('sort_order,name,demand_kind,demand_value,slab_label')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CldStageRow[];
}

export async function insertDefaultPaymentSchedule(
  admin: SupabaseClient,
  bookingId: string,
  opts: {
    projectId: string;
    unitId: string;
    bookingAmount: number;
    salesInquiryId?: string | null;
    /** Agreed deal value; defaults to inquiry negotiation then unit list. */
    agreementTotalInr?: number | null;
  }
) {
  const [stages, unitListInr, negotiatedInr] = await Promise.all([
    loadProjectCldStages(admin, opts.projectId),
    loadAgreementTotalInr(admin, opts.unitId),
    opts.agreementTotalInr != null && opts.agreementTotalInr > 0
      ? Promise.resolve(Math.round(opts.agreementTotalInr))
      : loadNegotiatedTotalFromInquiry(admin, opts.salesInquiryId)
  ]);

  const agreementTotalInr =
    negotiatedInr != null && negotiatedInr > 0
      ? negotiatedInr
      : unitListInr;

  const scheduleRows = buildPaymentScheduleRows(
    stages,
    bookingId,
    agreementTotalInr,
    opts.bookingAmount
  );

  const { error } = await admin.from('payment_schedules').insert(scheduleRows);
  if (error) throw new Error(error.message);
}

export async function sumCollectionsForBooking(
  admin: SupabaseClient,
  bookingId: string
): Promise<number> {
  const { data, error } = await admin
    .from('collections')
    .select('received_amount')
    .eq('booking_id', bookingId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce(
    (sum, row) => sum + Number(row.received_amount ?? 0),
    0
  );
}

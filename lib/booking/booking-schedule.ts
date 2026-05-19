import type { SupabaseClient } from '@supabase/supabase-js';
import { negotiatedPriceFromInquiryStage } from '@/app/crm/booking-financial-total';
import { isTokenStageComplete } from '@/app/crm/bookings/booking-stage-transitions';
import type { BookingTokenStageData } from '@/app/crm/bookings/booking-types';
import { unitAgreementTotalInr, type UnitPricingInput } from '@/app/crm/inr-format';
import { resolveSaleTotalInrForBooking } from '@/lib/booking/resolve-sale-total';

export type CldStageRow = {
  id?: string;
  sort_order: number;
  name: string;
  demand_kind: string;
  demand_value: number;
  slab_label: string | null;
};

export type CldStageWithId = CldStageRow & { id: string };

export type PaymentScheduleInsertRow = {
  booking_id: string;
  instalment_no: number;
  milestone: string;
  due_date: string;
  amount: number;
};

type ScheduleExistingRow = {
  id: string;
  instalment_no: number;
  milestone: string;
  due_date: string | null;
  amount: number;
};

/** Token / booking column — stage_data.token.amount is used when column is empty. */
export function resolveBookingAmountInr(opts: {
  bookingAmount?: number | null;
  stageData?: Record<string, unknown> | null;
}): number {
  const fromColumn = Math.round(Number(opts.bookingAmount || 0));
  if (fromColumn > 0) return fromColumn;
  const token = (opts.stageData as { token?: { amount?: unknown } } | null)?.token;
  const raw = String(token?.amount ?? '')
    .trim()
    .replace(/,/g, '');
  return Math.max(0, Math.round(Number(raw) || 0));
}

function addDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function cldMilestoneLabel(stage: CldStageRow) {
  const slab = stage.slab_label?.trim();
  return slab ? `${stage.name} (${slab})` : stage.name;
}

export function cldStageDemandAmount(
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

/** When no CLD plan: booking token + pending balance = final unit sale price. */
function fallbackScheduleRows(
  bookingId: string,
  bookingAmount: number,
  saleTotalInr: number
): PaymentScheduleInsertRow[] {
  const total = Math.max(
    0,
    Math.round(saleTotalInr),
    Math.round(bookingAmount)
  );
  const booking = Math.max(0, Math.round(bookingAmount));
  const pending = Math.max(0, total - booking);

  const rows: PaymentScheduleInsertRow[] = [
    {
      booking_id: bookingId,
      instalment_no: 1,
      milestone: 'Booking Amount',
      due_date: addDaysISO(0),
      amount: booking > 0 ? booking : total
    }
  ];

  if (pending > 0) {
    rows.push({
      booking_id: bookingId,
      instalment_no: 2,
      milestone: 'Pending Amount',
      due_date: addDaysISO(30),
      amount: pending
    });
  }

  return rows;
}

/** Ensure schedule demand sums to the final unit sale price. */
export function balanceScheduleToSaleTotal(
  rows: PaymentScheduleInsertRow[],
  saleTotalInr: number,
  bookingAmount: number
): PaymentScheduleInsertRow[] {
  const target = Math.max(
    0,
    Math.round(saleTotalInr),
    Math.round(bookingAmount)
  );
  if (target <= 0 || !rows.length) return rows;

  const out = rows.map((r) => ({
    ...r,
    amount: Math.max(0, Math.round(Number(r.amount) || 0))
  }));
  let sum = out.reduce((s, r) => s + r.amount, 0);
  if (sum === target) return out;

  if (sum < target) {
    const remainder = target - sum;
    const pendingIdx = out.findIndex((r) =>
      /pending/i.test(r.milestone)
    );
    if (pendingIdx >= 0) {
      out[pendingIdx] = {
        ...out[pendingIdx]!,
        amount: out[pendingIdx]!.amount + remainder
      };
      return out;
    }
    const maxInst = out.reduce((m, r) => Math.max(m, r.instalment_no), 0);
    out.push({
      booking_id: out[0]!.booking_id,
      instalment_no: maxInst + 1,
      milestone: 'Pending Amount',
      due_date: addDaysISO(30),
      amount: remainder
    });
    return out;
  }

  let excess = sum - target;
  for (let i = out.length - 1; i >= 0 && excess > 0; i--) {
    if (i === 0 && bookingAmount > 0) continue;
    const row = out[i]!;
    const cut = Math.min(row.amount, excess);
    row.amount -= cut;
    excess -= cut;
  }
  return out.filter((r, i) => r.amount > 0 || (i === 0 && bookingAmount > 0));
}

export function buildPaymentScheduleRows(
  stages: CldStageRow[],
  bookingId: string,
  saleTotalInr: number,
  bookingAmount: number
): PaymentScheduleInsertRow[] {
  if (!stages.length) {
    return fallbackScheduleRows(bookingId, bookingAmount, saleTotalInr);
  }

  const ordered = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const rows = ordered.map((stage, index) => {
    const instalmentNo = index + 1;
    return {
      booking_id: bookingId,
      instalment_no: instalmentNo,
      milestone:
        instalmentNo === 1 && bookingAmount > 0
          ? 'Booking Amount'
          : cldMilestoneLabel(stage),
      due_date: addDaysISO(index * 30),
      amount: cldStageDemandAmount(
        stage,
        saleTotalInr,
        instalmentNo,
        bookingAmount
      )
    };
  });
  return balanceScheduleToSaleTotal(rows, saleTotalInr, bookingAmount);
}

function isMilestoneFullyPaid(scheduled: number, received: number) {
  const demand = Math.round(Number(scheduled) || 0);
  const paid = Math.round(Number(received) || 0);
  return demand > 0 && paid >= demand;
}

/**
 * Keeps fully paid milestones unchanged; spreads any shortfall across unpaid rows
 * using CLD demand weights (never below collections already received).
 */
export function mergeScheduleWithSettledCollections(
  targetRows: PaymentScheduleInsertRow[],
  existing: ScheduleExistingRow[],
  receivedByScheduleId: Record<string, number>,
  saleTotalInr: number
): PaymentScheduleInsertRow[] {
  const target = Math.max(0, Math.round(saleTotalInr));
  if (!targetRows.length) return targetRows;

  const existingByInst = new Map(
    existing.map((row) => [Number(row.instalment_no), row])
  );

  const settled: PaymentScheduleInsertRow[] = [];
  const flex: Array<{
    row: PaymentScheduleInsertRow;
    weight: number;
    minAmount: number;
  }> = [];

  let lockedTotal = 0;

  for (const targetRow of targetRows) {
    const ex = existingByInst.get(targetRow.instalment_no);
    const received = ex ? receivedByScheduleId[ex.id] ?? 0 : 0;
    const scheduled = ex ? Math.round(Number(ex.amount) || 0) : 0;

    if (isMilestoneFullyPaid(scheduled, received)) {
      settled.push({
        ...targetRow,
        amount: scheduled,
        due_date: ex?.due_date?.slice(0, 10) ?? targetRow.due_date
      });
      lockedTotal += scheduled;
    } else {
      flex.push({
        row: targetRow,
        weight: Math.max(0, Math.round(Number(targetRow.amount) || 0)),
        minAmount: Math.max(0, Math.round(received))
      });
    }
  }

  if (!flex.length) return settled;

  const flexTotal = Math.max(0, target - lockedTotal);
  const minSum = flex.reduce((s, f) => s + f.minAmount, 0);
  const distributable = Math.max(0, flexTotal - minSum);
  const weightSum =
    flex.reduce((s, f) => s + f.weight, 0) || flex.length;

  let extraAssigned = 0;
  const unpaid: PaymentScheduleInsertRow[] = [];

  for (let i = 0; i < flex.length; i++) {
    const f = flex[i]!;
    let extra: number;
    if (i === flex.length - 1) {
      extra = distributable - extraAssigned;
    } else {
      extra =
        weightSum > 0
          ? Math.round((distributable * f.weight) / weightSum)
          : Math.floor(distributable / flex.length);
      extraAssigned += extra;
    }
    unpaid.push({
      ...f.row,
      amount: f.minAmount + extra
    });
  }

  const merged = [...settled, ...unpaid].sort(
    (a, b) => a.instalment_no - b.instalment_no
  );
  const sum = merged.reduce((s, r) => s + r.amount, 0);
  if (sum !== target && unpaid.length > 0) {
    const last = unpaid[unpaid.length - 1]!;
    last.amount = Math.max(last.amount + (target - sum), 0);
  }
  return merged;
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
): Promise<CldStageWithId[]> {
  const { data, error } = await admin
    .from('project_cld_stages')
    .select('id,sort_order,name,demand_kind,demand_value,slab_label')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CldStageWithId[];
}

export function cldInstalmentNoForStage(
  stages: CldStageWithId[],
  stageId: string
): number | null {
  const ordered = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const idx = ordered.findIndex((s) => s.id === stageId);
  return idx >= 0 ? idx + 1 : null;
}

export async function resolveAgreementTotalInrForBooking(
  admin: SupabaseClient,
  opts: {
    unitId: string;
    projectId: string;
    salesInquiryId?: string | null;
    agreementTotalInr?: number | null;
    saleTotalInr?: number | null;
  }
): Promise<number> {
  if (opts.saleTotalInr != null && opts.saleTotalInr > 0) {
    return Math.round(opts.saleTotalInr);
  }
  if (opts.agreementTotalInr != null && opts.agreementTotalInr > 0) {
    return Math.round(opts.agreementTotalInr);
  }
  return resolveSaleTotalInrForBooking(admin, {
    unitId: opts.unitId,
    projectId: opts.projectId,
    salesInquiryId: opts.salesInquiryId
  });
}

export async function insertDefaultPaymentSchedule(
  admin: SupabaseClient,
  bookingId: string,
  opts: {
    projectId: string;
    unitId: string;
    bookingAmount?: number;
    salesInquiryId?: string | null;
    stageData?: Record<string, unknown> | null;
    /** @deprecated Use saleTotalInr — agreed deal value incl. GST when known. */
    agreementTotalInr?: number | null;
    /** Final unit sale price (negotiated or catalog); used for schedule demand. */
    saleTotalInr?: number | null;
  }
) {
  const bookingAmount = resolveBookingAmountInr({
    bookingAmount: opts.bookingAmount,
    stageData: opts.stageData
  });

  const [stages, saleTotalInr] = await Promise.all([
    loadProjectCldStages(admin, opts.projectId),
    resolveAgreementTotalInrForBooking(admin, {
      unitId: opts.unitId,
      projectId: opts.projectId,
      salesInquiryId: opts.salesInquiryId,
      agreementTotalInr: opts.agreementTotalInr,
      saleTotalInr: opts.saleTotalInr
    })
  ]);

  const scheduleRows = buildPaymentScheduleRows(
    stages,
    bookingId,
    saleTotalInr,
    bookingAmount
  );

  const { error } = await admin.from('payment_schedules').insert(scheduleRows);
  if (error) throw new Error(error.message);

  await ensureTokenCollectionForBooking(admin, bookingId, {
    bookingAmount,
    stageData: opts.stageData
  });
}

/**
 * Record token-stage payment as a collection on instalment 1 (Booking Amount).
 * Idempotent: only tops up when schedule line received is below token amount.
 */
export async function ensureTokenCollectionForBooking(
  admin: SupabaseClient,
  bookingId: string,
  opts?: {
    stageData?: Record<string, unknown> | null;
    bookingAmount?: number | null;
    paymentMode?: string | null;
    createdBy?: string | null;
  }
): Promise<{ created: boolean }> {
  let stageData = opts?.stageData ?? null;
  let paymentMode = opts?.paymentMode ?? null;
  let bookingAmount = opts?.bookingAmount ?? null;

  if (!stageData || paymentMode == null || bookingAmount == null) {
    const { data: booking, error: bErr } = await admin
      .from('bookings')
      .select('booking_amount,stage_data,payment_mode')
      .eq('id', bookingId)
      .maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!booking) return { created: false };
    stageData =
      stageData ??
      (booking.stage_data as Record<string, unknown> | null) ??
      null;
    paymentMode ??= (booking.payment_mode as string | null) ?? null;
    bookingAmount ??= booking.booking_amount as number | null;
  }

  if (!isTokenStageComplete(stageData)) return { created: false };

  const tokenAmount = resolveBookingAmountInr({
    bookingAmount,
    stageData
  });
  if (tokenAmount <= 0) return { created: false };

  const { data: schedule, error: sErr } = await admin
    .from('payment_schedules')
    .select('id,amount')
    .eq('booking_id', bookingId)
    .eq('instalment_no', 1)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!schedule?.id) return { created: false };

  const scheduleId = schedule.id as string;
  const demand = Math.round(Number(schedule.amount) || 0);
  const targetReceived = Math.min(
    tokenAmount,
    demand > 0 ? demand : tokenAmount
  );

  const { data: cols, error: cErr } = await admin
    .from('collections')
    .select('received_amount')
    .eq('booking_id', bookingId)
    .eq('schedule_id', scheduleId);
  if (cErr) throw new Error(cErr.message);

  const received = (cols ?? []).reduce(
    (sum, row) => sum + Number(row.received_amount ?? 0),
    0
  );
  const shortfall = targetReceived - Math.round(received);
  if (shortfall <= 0) return { created: false };

  const token = (stageData as { token?: BookingTokenStageData } | null)?.token;
  const receivedAt = String(token?.date ?? '').trim() || null;
  const mode =
    String(token?.mode ?? paymentMode ?? '').trim() || null;
  const reference =
    String(token?.reference ?? '').trim() || 'Token payment';

  const row: {
    booking_id: string;
    schedule_id: string;
    received_amount: number;
    received_at: string | null;
    mode: string | null;
    reference: string;
    created_by?: string;
  } = {
    booking_id: bookingId,
    schedule_id: scheduleId,
    received_amount: shortfall,
    received_at: receivedAt,
    mode,
    reference
  };
  if (opts?.createdBy) row.created_by = opts.createdBy;

  const { error: insErr } = await admin.from('collections').insert(row);
  if (insErr) throw new Error(insErr.message);
  return { created: true };
}

function scheduleRowChanged(
  existing: ScheduleExistingRow | undefined,
  next: PaymentScheduleInsertRow
) {
  if (!existing) return true;
  if (Math.round(Number(existing.amount) || 0) !== next.amount) return true;
  if (String(existing.milestone) !== next.milestone) return true;
  const prevDue = existing.due_date?.slice(0, 10) ?? '';
  if (prevDue !== next.due_date) return true;
  return false;
}

/**
 * Rebuild payment schedule from project CLD + sale total, preserving fully paid
 * milestones and redistributing the balance across upcoming instalments.
 */
export async function syncBookingPaymentScheduleToSaleTotal(
  admin: SupabaseClient,
  bookingId: string,
  overrides?: {
    stageData?: Record<string, unknown> | null;
    bookingAmount?: number | null;
    createdBy?: string | null;
  }
): Promise<{ updated: boolean; saleTotalInr: number; scheduleSum: number }> {
  const { data: booking, error: bErr } = await admin
    .from('bookings')
    .select(
      'id,project_id,unit_id,sales_inquiry_id,booking_amount,stage_data,status,payment_mode'
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (bErr) throw new Error(bErr.message);
  if (!booking) throw new Error('Booking not found');
  if (booking.status === 'cancelled') {
    throw new Error('Booking is cancelled');
  }

  const projectId = booking.project_id as string;
  const unitId = booking.unit_id as string;
  const salesInquiryId = (booking.sales_inquiry_id as string | null) ?? null;
  const stageData =
    overrides?.stageData ??
    (booking.stage_data as Record<string, unknown> | null) ??
    null;
  const bookingAmount = resolveBookingAmountInr({
    bookingAmount:
      overrides?.bookingAmount ?? (booking.booking_amount as number | null),
    stageData
  });

  const [stages, saleTotalInr] = await Promise.all([
    loadProjectCldStages(admin, projectId),
    resolveSaleTotalInrForBooking(admin, {
      unitId,
      projectId,
      salesInquiryId
    })
  ]);

  const targetRows = buildPaymentScheduleRows(
    stages,
    bookingId,
    saleTotalInr,
    bookingAmount
  );

  const { data: schedules, error: sErr } = await admin
    .from('payment_schedules')
    .select('id,instalment_no,milestone,due_date,amount')
    .eq('booking_id', bookingId)
    .order('instalment_no', { ascending: true });
  if (sErr) throw new Error(sErr.message);

  if (!schedules?.length) {
    await insertDefaultPaymentSchedule(admin, bookingId, {
      projectId,
      unitId,
      bookingAmount,
      salesInquiryId,
      saleTotalInr,
      stageData
    });
    return { updated: true, saleTotalInr, scheduleSum: saleTotalInr };
  }

  const { data: collections, error: cErr } = await admin
    .from('collections')
    .select('schedule_id,received_amount')
    .eq('booking_id', bookingId);
  if (cErr) throw new Error(cErr.message);

  const receivedByScheduleId: Record<string, number> = {};
  for (const c of collections ?? []) {
    const sid = c.schedule_id as string | null;
    if (!sid) continue;
    receivedByScheduleId[sid] =
      (receivedByScheduleId[sid] ?? 0) + Number(c.received_amount ?? 0);
  }

  const existing = (schedules ?? []) as ScheduleExistingRow[];
  const merged = mergeScheduleWithSettledCollections(
    targetRows,
    existing,
    receivedByScheduleId,
    saleTotalInr
  );

  const existingByInst = new Map(
    existing.map((row) => [Number(row.instalment_no), row])
  );
  const targetInstalments = new Set(merged.map((r) => r.instalment_no));

  let updated = false;

  for (const row of merged) {
    const prev = existingByInst.get(row.instalment_no);
    if (!prev) {
      const { error: iErr } = await admin.from('payment_schedules').insert(row);
      if (iErr) throw new Error(iErr.message);
      updated = true;
      continue;
    }
    if (!scheduleRowChanged(prev, row)) continue;
    const { error: uErr } = await admin
      .from('payment_schedules')
      .update({
        milestone: row.milestone,
        due_date: row.due_date,
        amount: row.amount
      })
      .eq('id', prev.id);
    if (uErr) throw new Error(uErr.message);
    updated = true;
  }

  for (const prev of existing) {
    if (targetInstalments.has(Number(prev.instalment_no))) continue;
    const received = receivedByScheduleId[prev.id] ?? 0;
    if (received > 0) {
      const closedAmount = Math.max(
        Math.round(Number(prev.amount) || 0),
        Math.round(received)
      );
      if (
        closedAmount !== Math.round(Number(prev.amount) || 0) ||
        !/closed/i.test(String(prev.milestone))
      ) {
        const { error: uErr } = await admin
          .from('payment_schedules')
          .update({
            amount: closedAmount,
            milestone: `${prev.milestone} (closed)`
          })
          .eq('id', prev.id);
        if (uErr) throw new Error(uErr.message);
        updated = true;
      }
      continue;
    }
    const { error: dErr } = await admin
      .from('payment_schedules')
      .delete()
      .eq('id', prev.id);
    if (dErr) throw new Error(dErr.message);
    updated = true;
  }

  const scheduleSum = merged.reduce((s, r) => s + r.amount, 0);

  await ensureTokenCollectionForBooking(admin, bookingId, {
    stageData,
    bookingAmount,
    paymentMode: (booking.payment_mode as string | null) ?? null,
    createdBy: overrides?.createdBy ?? undefined
  });

  return { updated, saleTotalInr, scheduleSum };
}

/** Resync schedules for all active bookings on a project (e.g. after CLD plan change). */
export async function syncProjectBookingPaymentSchedules(
  admin: SupabaseClient,
  projectId: string
): Promise<{ bookingsProcessed: number; schedulesUpdated: number }> {
  const { data: bookings, error: bErr } = await admin
    .from('bookings')
    .select('id')
    .eq('project_id', projectId)
    .neq('status', 'cancelled');
  if (bErr) throw new Error(bErr.message);

  let schedulesUpdated = 0;
  for (const row of bookings ?? []) {
    const result = await syncBookingPaymentScheduleToSaleTotal(
      admin,
      row.id as string
    );
    if (result.updated) schedulesUpdated += 1;
  }

  return {
    bookingsProcessed: bookings?.length ?? 0,
    schedulesUpdated
  };
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

export type ApplyCldCompletionResult = {
  bookingsProcessed: number;
  schedulesUpdated: number;
};

/** When a CLD stage is completed, activate that milestone on every active booking. */
export async function applyCldStageCompletionToProjectBookings(
  admin: SupabaseClient,
  opts: {
    projectId: string;
    stage: CldStageWithId;
    completedOn: string;
  }
): Promise<ApplyCldCompletionResult> {
  const { projectId, stage, completedOn } = opts;

  const stages = await loadProjectCldStages(admin, projectId);
  const instalmentNo = cldInstalmentNoForStage(stages, stage.id);
  if (instalmentNo == null) {
    throw new Error('CLD stage not found for this project');
  }

  const milestone = cldMilestoneLabel(stage);

  const { data: bookings, error: bErr } = await admin
    .from('bookings')
    .select('id,unit_id,sales_inquiry_id,booking_amount,stage_data')
    .eq('project_id', projectId)
    .neq('status', 'cancelled');
  if (bErr) throw new Error(bErr.message);

  let schedulesUpdated = 0;

  for (const booking of bookings ?? []) {
    const bookingId = booking.id as string;
    const bookingAmount = resolveBookingAmountInr({
      bookingAmount: booking.booking_amount as number | null,
      stageData:
        (booking.stage_data as Record<string, unknown> | null) ?? null
    });
    const unitId = booking.unit_id as string;
    const salesInquiryId = (booking.sales_inquiry_id as string | null) ?? null;

    const saleTotalInr = await resolveAgreementTotalInrForBooking(admin, {
      unitId,
      projectId,
      salesInquiryId
    });

    const amount = cldStageDemandAmount(
      stage,
      saleTotalInr,
      instalmentNo,
      bookingAmount
    );

    const { data: existing, error: exErr } = await admin
      .from('payment_schedules')
      .select('id,amount')
      .eq('booking_id', bookingId)
      .eq('instalment_no', instalmentNo)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);

    if (existing) {
      const updatePayload: {
        due_date: string;
        milestone: string;
        amount?: number;
      } = {
        due_date: completedOn,
        milestone
      };
      const existingAmount = Number(existing.amount || 0);
      if (existingAmount <= 0 && amount > 0) {
        updatePayload.amount = amount;
      }
      const { error: uErr } = await admin
        .from('payment_schedules')
        .update(updatePayload)
        .eq('id', existing.id as string);
      if (uErr) throw new Error(uErr.message);
      schedulesUpdated += 1;
      continue;
    }

    const { count, error: cErr } = await admin
      .from('payment_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId);
    if (cErr) throw new Error(cErr.message);

    if (!count) {
      await insertDefaultPaymentSchedule(admin, bookingId, {
        projectId,
        unitId,
        bookingAmount,
        salesInquiryId,
        saleTotalInr
      });
      const { error: uErr } = await admin
        .from('payment_schedules')
        .update({ due_date: completedOn, milestone })
        .eq('booking_id', bookingId)
        .eq('instalment_no', instalmentNo);
      if (uErr) throw new Error(uErr.message);
      schedulesUpdated += 1;
      continue;
    }

    const { error: iErr } = await admin.from('payment_schedules').insert({
      booking_id: bookingId,
      instalment_no: instalmentNo,
      milestone,
      due_date: completedOn,
      amount
    });
    if (iErr) throw new Error(iErr.message);
    schedulesUpdated += 1;
  }

  return {
    bookingsProcessed: bookings?.length ?? 0,
    schedulesUpdated
  };
}

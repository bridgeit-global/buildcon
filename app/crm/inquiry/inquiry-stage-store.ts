import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INQUIRY_PIPELINE_FUNNEL_STAGES,
  INQUIRY_CLOSED_FUNNEL_STAGE,
  isFunnelStageRegression,
  type InquiryFunnelStage,
  type InquiryPipelineFunnelStage
} from './inquiry-funnel-stages';
import type { InquiryStageData } from './inquiry-types';
import { isUnitTokenReceivedStatus } from '../inventory/unit-status';
import { INQUIRY_UNIT_TOKEN_LOCKED_MESSAGE } from './inquiry-booking-guard';
import {
  inquiryTokenPayloadsEqual,
  isInquiryTokenComplete,
  isInquiryTokenLocked
} from './inquiry-token-stage';

export const INQUIRY_STAGE_DB_NAMES = INQUIRY_PIPELINE_FUNNEL_STAGES;

/** JSON key on `sales_inquiries.stage_data` for each funnel stage row. */
export const STAGE_JSON_KEY: Record<
  InquiryPipelineFunnelStage,
  keyof InquiryStageData
> = {
  Enquiry: 'enquiry',
  Qualified: 'qualified',
  'Site Visit': 'site_visit',
  Negotiation: 'negotiation',
  Token: 'token'
};

type StageRow = {
  stage: InquiryFunnelStage;
  payload: Record<string, unknown>;
  completed_at: string | null;
};

function emptyStageData(): InquiryStageData {
  return {
    enquiry: {},
    qualified: {},
    site_visit: {},
    negotiation: {},
    token: {}
  };
}

function rowPayload(row: StageRow | undefined): Record<string, unknown> {
  const p = row?.payload;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
  return p;
}

export function stageDataFromRows(rows: StageRow[]): InquiryStageData {
  const base = emptyStageData();
  for (const stage of INQUIRY_STAGE_DB_NAMES) {
    const row = rows.find((r) => r.stage === stage);
    const key = STAGE_JSON_KEY[stage];
    base[key] = rowPayload(row);
  }
  return base;
}

export async function ensureInquiryStagesSeeded(
  supabase: SupabaseClient,
  inquiryId: string
): Promise<{ ok: boolean; error?: string }> {
  const id = String(inquiryId || '').trim();
  if (!id) return { ok: true };

  const missing = INQUIRY_STAGE_DB_NAMES.map((stage) => ({
    sales_inquiry_id: id,
    stage
  }));

  const { error } = await supabase
    .from('sales_inquiry_stages')
    .upsert(missing, { onConflict: 'sales_inquiry_id,stage', ignoreDuplicates: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function loadInquiryStageRows(
  supabase: SupabaseClient,
  inquiryId: string
): Promise<{ rows: StageRow[]; error?: string }> {
  const id = String(inquiryId || '').trim();
  if (!id) return { rows: [] };

  await ensureInquiryStagesSeeded(supabase, id);

  const { data, error } = await supabase
    .from('sales_inquiry_stages')
    .select('stage, payload, completed_at')
    .eq('sales_inquiry_id', id);

  if (error) return { rows: [], error: error.message };

  const rows = (data ?? []).map((r) => ({
    stage: String((r as { stage: string }).stage) as InquiryFunnelStage,
    payload: ((r as { payload?: unknown }).payload ?? {}) as Record<string, unknown>,
    completed_at: (r as { completed_at?: string | null }).completed_at ?? null
  }));

  return { rows };
}

function approvalStatusFromRow(status: string | null | undefined): string {
  const s = String(status || '').trim();
  if (s === 'Approved') return 'approved';
  if (s === 'Rejected') return 'rejected';
  if (s === 'Pending') return 'pending';
  return '';
}

/** Merge latest `negotiation_approvals` row into negotiation payload when stage row is stale. */
export async function enrichNegotiationFromApprovals(
  supabase: SupabaseClient,
  inquiryId: string,
  data: InquiryStageData
): Promise<InquiryStageData> {
  const id = String(inquiryId || '').trim();
  if (!id) return data;

  const neg = { ...((data.negotiation ?? {}) as Record<string, unknown>) };
  const approvalId = String(neg.approval_id ?? '').trim();

  type ApprovalRow = {
    id: string;
    status: string;
    offered_price: number | string | null;
    decision_note: string | null;
  };

  let approvalRow: ApprovalRow | undefined;

  if (approvalId) {
    const { data: row } = await supabase
      .from('negotiation_approvals')
      .select('id, status, offered_price, decision_note')
      .eq('id', approvalId)
      .maybeSingle();
    if (row) approvalRow = row as ApprovalRow;
  } else {
    const { data: rows } = await supabase
      .from('negotiation_approvals')
      .select('id, status, offered_price, decision_note')
      .eq('sales_inquiry_id', id)
      .order('requested_at', { ascending: false })
      .limit(1);
    const latest = rows?.[0];
    if (latest) approvalRow = latest as ApprovalRow;
  }

  if (!approvalRow) return data;

  const status = approvalStatusFromRow(approvalRow.status);
  const offered =
    approvalRow.offered_price != null
      ? String(approvalRow.offered_price)
      : String(neg.offered_price ?? '');

  return {
    ...data,
    negotiation: {
      ...neg,
      approval_id: approvalRow.id,
      ...(offered ? { offered_price: offered } : {}),
      ...(status ? { approval_status: status } : {}),
      ...(approvalRow.decision_note
        ? { decision_note: approvalRow.decision_note }
        : {})
    }
  };
}

export async function loadInquiryStageData(
  supabase: SupabaseClient,
  inquiryId: string
): Promise<{ data: InquiryStageData; error?: string }> {
  const { rows, error } = await loadInquiryStageRows(supabase, inquiryId);
  if (error) return { data: emptyStageData(), error };
  const base = stageDataFromRows(rows);
  const data = await enrichNegotiationFromApprovals(supabase, inquiryId, base);
  return { data };
}

/** Persist pending negotiation approval into `sales_inquiry_stages` (mirrors to `stage_data`). */
export async function persistNegotiationApprovalRequest(
  supabase: SupabaseClient,
  params: {
    inquiryId: string;
    approvalId: string;
    offeredPrice: string;
    notes?: string;
    funnelStage?: InquiryFunnelStage;
    siteVisitPatch?: Record<string, unknown>;
    negotiationPatch?: Record<string, unknown>;
  }
): Promise<{ ok: boolean; error?: string }> {
  const patch: Partial<InquiryStageData> = {
    negotiation: {
      offered_price: params.offeredPrice,
      approval_status: 'pending',
      approval_id: params.approvalId,
      ...(params.notes ? { notes: params.notes } : {}),
      ...(params.negotiationPatch ?? {})
    }
  };
  if (params.siteVisitPatch) {
    patch.site_visit = params.siteVisitPatch;
  }
  return saveInquiryStageData(supabase, {
    inquiryId: params.inquiryId,
    patch,
    funnelStage: params.funnelStage ?? 'Negotiation'
  });
}

export function stageHasMeaningfulData(
  stage: InquiryFunnelStage,
  data: InquiryStageData
): boolean {
  if (stage === INQUIRY_CLOSED_FUNNEL_STAGE) return false;
  const key = STAGE_JSON_KEY[stage];
  const block = data[key];
  if (!block || typeof block !== 'object' || Array.isArray(block)) return false;
  return Object.values(block).some((v) => {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    return true;
  });
}

export async function upsertInquiryStagePayload(
  supabase: SupabaseClient,
  params: {
    inquiryId: string;
    stage: InquiryPipelineFunnelStage;
    payload: Record<string, unknown>;
    markCompleted?: boolean;
  }
): Promise<{ ok: boolean; error?: string }> {
  const id = String(params.inquiryId || '').trim();
  if (!id) return { ok: false, error: 'Missing inquiry id' };

  const seed = await ensureInquiryStagesSeeded(supabase, id);
  if (!seed.ok) return seed;

  const patch: Record<string, unknown> = {
    sales_inquiry_id: id,
    stage: params.stage,
    payload: params.payload ?? {}
  };
  if (params.markCompleted) {
    patch.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('sales_inquiry_stages')
    .upsert(patch, { onConflict: 'sales_inquiry_id,stage' });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function inquiryHasConfirmedBooking(
  supabase: SupabaseClient,
  inquiryId: string
): Promise<boolean> {
  const id = String(inquiryId || '').trim();
  if (!id) return false;

  const { data, error } = await supabase
    .from('bookings')
    .select('id')
    .eq('sales_inquiry_id', id)
    .eq('workflow_stage', 'confirmation')
    .neq('status', 'cancelled')
    .limit(1)
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
}

/** Upsert one or more stage payloads; DB trigger mirrors into `sales_inquiries.stage_data`. */
export async function saveInquiryStageData(
  supabase: SupabaseClient,
  params: {
    inquiryId: string;
    patch: Partial<InquiryStageData>;
    funnelStage?: InquiryFunnelStage | string;
    markStagesCompleted?: InquiryFunnelStage[];
    /** When false (default), do not move `funnel_stage` backward (e.g. Enquiry save on a Qualified lead). */
    allowFunnelDowngrade?: boolean;
  }
): Promise<{ ok: boolean; error?: string }> {
  const id = String(params.inquiryId || '').trim();
  if (!id) return { ok: false, error: 'Missing inquiry id' };

  const patch: Partial<InquiryStageData> = { ...params.patch };

  const [{ rows: existingRows }, { data: inquiryRow }, bookingConfirmed] =
    await Promise.all([
      loadInquiryStageRows(supabase, id),
      supabase
        .from('sales_inquiries')
        .select('stage_data, unit_id, funnel_stage')
        .eq('id', id)
        .maybeSingle(),
      inquiryHasConfirmedBooking(supabase, id)
    ]);

  const unitId = String(inquiryRow?.unit_id ?? '').trim();
  if (unitId) {
    const { data: unitRow } = await supabase
      .from('units')
      .select('status')
      .eq('id', unitId)
      .maybeSingle();
    if (isUnitTokenReceivedStatus(unitRow?.status as string | undefined)) {
      return { ok: false, error: INQUIRY_UNIT_TOKEN_LOCKED_MESSAGE };
    }
  }

  const existingStageData = stageDataFromRows(existingRows);
  const closedPayload =
    (inquiryRow?.stage_data as Record<string, unknown> | null) ?? existingStageData;
  const inquiryClosed =
    closedPayload &&
    typeof closedPayload === 'object' &&
    !Array.isArray(closedPayload) &&
    (closedPayload as Record<string, unknown>).closed === true;
  const tokenLocked = isInquiryTokenLocked(existingStageData, {
    inquiryClosed,
    bookingConfirmed
  });

  if (patch.token !== undefined) {
    const nextToken = (patch.token ?? {}) as Record<string, unknown>;
    const existingToken = (existingStageData.token ?? {}) as Record<string, unknown>;

    if (tokenLocked) {
      if (!inquiryTokenPayloadsEqual(existingToken, nextToken)) {
        return {
          ok: false,
          error:
            'Token details cannot be changed after recording or booking confirmation.'
        };
      }
      delete patch.token;
    } else {
      const mergedToken = { ...existingToken, ...nextToken };
      if (isInquiryTokenComplete({ token: mergedToken })) {
        patch.token = {
          ...mergedToken,
          recorded_at:
            String(mergedToken.recorded_at ?? '').trim() ||
            new Date().toISOString()
        };
      }
    }
  }

  const completed = new Set(params.markStagesCompleted ?? []);

  for (const stage of INQUIRY_STAGE_DB_NAMES) {
    const key = STAGE_JSON_KEY[stage];
    const payload = patch[key];
    if (payload === undefined) continue;
    const result = await upsertInquiryStagePayload(supabase, {
      inquiryId: id,
      stage,
      payload: (payload ?? {}) as Record<string, unknown>,
      markCompleted: completed.has(stage)
    });
    if (!result.ok) return result;
  }

  if (params.funnelStage) {
    const currentFunnel = String(inquiryRow?.funnel_stage ?? 'Enquiry').trim();
    const nextFunnel = String(params.funnelStage).trim();
    const regressing = isFunnelStageRegression(currentFunnel, nextFunnel);
    if (!regressing || params.allowFunnelDowngrade) {
      const { error } = await supabase
        .from('sales_inquiries')
        .update({ funnel_stage: nextFunnel })
        .eq('id', id);
      if (error) return { ok: false, error: error.message };
    } else {
      return {
        ok: false,
        error: `Cannot move enquiry from ${currentFunnel} back to ${nextFunnel}.`
      };
    }
  }

  return { ok: true };
}

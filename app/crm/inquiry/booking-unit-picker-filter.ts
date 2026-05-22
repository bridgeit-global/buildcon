import type { SupabaseClient } from '@supabase/supabase-js';
import {
  bookingBlockedByNegotiationApproval,
  isInquiryClosed
} from './inquiry-stage-transitions';
import type { InquiryStageData } from './inquiry-types';

type ApprovalRow = {
  sales_inquiry_id: string;
  id: string;
  status: string;
  offered_price: number | string | null;
  decision_note: string | null;
};

function approvalStatusFromRow(status: string | null | undefined): string {
  const s = String(status || '').trim();
  if (s === 'Approved') return 'approved';
  if (s === 'Rejected') return 'rejected';
  if (s === 'Pending') return 'pending';
  return '';
}

function negotiationFromInquiryRow(
  stageData: unknown,
  approval: ApprovalRow | undefined
): Record<string, unknown> | undefined {
  if (!stageData || typeof stageData !== 'object' || Array.isArray(stageData)) {
    return undefined;
  }
  const neg = {
    ...(((stageData as InquiryStageData).negotiation ?? {}) as Record<
      string,
      unknown
    >)
  };
  if (!approval) return neg;

  const status = approvalStatusFromRow(approval.status);
  const offered =
    approval.offered_price != null
      ? String(approval.offered_price)
      : String(neg.offered_price ?? '');

  return {
    ...neg,
    approval_id: approval.id,
    ...(offered ? { offered_price: offered } : {}),
    ...(status ? { approval_status: status } : {}),
    ...(approval.decision_note
      ? { decision_note: approval.decision_note }
      : {})
  };
}

function inquiryBlocksUnitInBookingPicker(
  funnelStage: string | null | undefined,
  stageData: unknown,
  approval: ApprovalRow | undefined
): boolean {
  if (isInquiryClosed(stageData)) return false;
  const negotiation = negotiationFromInquiryRow(stageData, approval);
  return bookingBlockedByNegotiationApproval(negotiation, {
    funnelStage: String(funnelStage ?? '')
  });
}

/** Unit IDs held by an open enquiry with negotiate approval still blocking booking. */
export async function unitIdsHiddenByNegotiationApproval(
  supabase: SupabaseClient,
  unitIds: string[]
): Promise<Set<string>> {
  const ids = [...new Set(unitIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return new Set();

  const { data: inquiries, error } = await supabase
    .from('sales_inquiries')
    .select('id, unit_id, funnel_stage, stage_data')
    .in('unit_id', ids);

  if (error || !inquiries?.length) return new Set();

  const active = inquiries.filter((row) => {
    const unitId = String(row.unit_id ?? '').trim();
    return unitId && !isInquiryClosed(row.stage_data);
  });
  if (!active.length) return new Set();

  const inquiryIds = active.map((r) => String(r.id));
  const { data: approvalRows } = await supabase
    .from('negotiation_approvals')
    .select(
      'sales_inquiry_id, id, status, offered_price, decision_note, requested_at'
    )
    .in('sales_inquiry_id', inquiryIds)
    .order('requested_at', { ascending: false });

  const latestApprovalByInquiry = new Map<string, ApprovalRow>();
  for (const row of approvalRows ?? []) {
    const iid = String(row.sales_inquiry_id ?? '').trim();
    if (!iid || latestApprovalByInquiry.has(iid)) continue;
    latestApprovalByInquiry.set(iid, row as ApprovalRow);
  }

  const hidden = new Set<string>();
  for (const inq of active) {
    const unitId = String(inq.unit_id ?? '').trim();
    const approval = latestApprovalByInquiry.get(String(inq.id));
    if (
      inquiryBlocksUnitInBookingPicker(inq.funnel_stage, inq.stage_data, approval)
    ) {
      hidden.add(unitId);
    }
  }
  return hidden;
}

/** Whether a specific enquiry still blocks its unit on the create-booking picker. */
export async function inquiryUnitHiddenFromBookingPicker(
  supabase: SupabaseClient,
  inquiryId: string
): Promise<boolean> {
  const id = String(inquiryId || '').trim();
  if (!id) return false;

  const { data: inq, error } = await supabase
    .from('sales_inquiries')
    .select('id, unit_id, funnel_stage, stage_data')
    .eq('id', id)
    .maybeSingle();

  if (error || !inq?.unit_id) return false;
  if (isInquiryClosed(inq.stage_data)) return false;

  const neg = negotiationFromInquiryRow(inq.stage_data, undefined);
  const approvalId = String(neg?.approval_id ?? '').trim();

  let approval: ApprovalRow | undefined;
  if (approvalId) {
    const { data: row } = await supabase
      .from('negotiation_approvals')
      .select(
        'sales_inquiry_id, id, status, offered_price, decision_note, requested_at'
      )
      .eq('id', approvalId)
      .maybeSingle();
    if (row) approval = row as ApprovalRow;
  } else {
    const { data: rows } = await supabase
      .from('negotiation_approvals')
      .select(
        'sales_inquiry_id, id, status, offered_price, decision_note, requested_at'
      )
      .eq('sales_inquiry_id', id)
      .order('requested_at', { ascending: false })
      .limit(1);
    if (rows?.[0]) approval = rows[0] as ApprovalRow;
  }

  return inquiryBlocksUnitInBookingPicker(
    inq.funnel_stage,
    inq.stage_data,
    approval
  );
}

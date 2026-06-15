import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INQUIRY_PIPELINE_UI_STAGES,
  type InquiryPipelineUiStage
} from './inquiry-funnel-stages';
import type {
  WizardSavedSnapshots,
  WizardStep1Snapshot,
  WizardStep2Snapshot,
  WizardStep3Snapshot,
  WizardStepId
} from './inquiry-wizard-snapshots';

export type InquiryWizardUiDrafts = {
  '1'?: WizardStep1Snapshot;
  '2'?: WizardStep2Snapshot;
  '3'?: WizardStep3Snapshot;
};

export type InquiryWizardUiDirty = {
  '1'?: boolean;
  '2'?: boolean;
  '3'?: boolean;
};

/** Persisted on `sales_inquiries.wizard_ui`. */
export type InquiryWizardUiState = {
  view_stage?: InquiryPipelineUiStage;
  wizard_step?: WizardStepId;
  drafts?: InquiryWizardUiDrafts;
  dirty?: InquiryWizardUiDirty;
  updated_at?: string;
};

const WIZARD_STEP_KEYS = ['1', '2', '3'] as const;

function isPipelineUiStage(v: unknown): v is InquiryPipelineUiStage {
  return (
    typeof v === 'string' &&
    (INQUIRY_PIPELINE_UI_STAGES as readonly string[]).includes(v)
  );
}

function isWizardStepId(v: unknown): v is WizardStepId {
  return v === 1 || v === 2 || v === 3;
}

export function parseInquiryWizardUi(raw: unknown): InquiryWizardUiState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: InquiryWizardUiState = {};

  if (isPipelineUiStage(o.view_stage)) out.view_stage = o.view_stage;
  if (isWizardStepId(o.wizard_step)) out.wizard_step = o.wizard_step;

  const draftsRaw = o.drafts;
  if (draftsRaw && typeof draftsRaw === 'object' && !Array.isArray(draftsRaw)) {
    const d = draftsRaw as Record<string, unknown>;
    const drafts: InquiryWizardUiDrafts = {};
    if (d['1'] && typeof d['1'] === 'object') drafts['1'] = d['1'] as WizardStep1Snapshot;
    if (d['2'] && typeof d['2'] === 'object') drafts['2'] = d['2'] as WizardStep2Snapshot;
    if (d['3'] && typeof d['3'] === 'object') drafts['3'] = d['3'] as WizardStep3Snapshot;
    if (Object.keys(drafts).length > 0) out.drafts = drafts;
  }

  const dirtyRaw = o.dirty;
  if (dirtyRaw && typeof dirtyRaw === 'object' && !Array.isArray(dirtyRaw)) {
    const dirty: InquiryWizardUiDirty = {};
    for (const key of WIZARD_STEP_KEYS) {
      const v = (dirtyRaw as Record<string, unknown>)[key];
      if (typeof v === 'boolean') dirty[key] = v;
    }
    if (Object.keys(dirty).length > 0) out.dirty = dirty;
  }

  if (typeof o.updated_at === 'string' && o.updated_at.trim()) {
    out.updated_at = o.updated_at.trim();
  }

  return out;
}

export function buildWizardUiDraftPayload(
  _saved: WizardSavedSnapshots,
  draft: WizardSavedSnapshots,
  stepDirty: Record<WizardStepId, boolean>
): Pick<InquiryWizardUiState, 'drafts' | 'dirty'> {
  const drafts: InquiryWizardUiDrafts = {};
  const dirty: InquiryWizardUiDirty = {};

  for (const step of [1, 2, 3] as const) {
    const key = String(step) as keyof InquiryWizardUiDrafts;
    dirty[key] = stepDirty[step];
    if (stepDirty[step]) {
      drafts[key] = draft[step] as never;
    }
  }

  return { drafts, dirty };
}

function mergeWizardUiState(
  current: InquiryWizardUiState,
  patch: Partial<InquiryWizardUiState>
): InquiryWizardUiState {
  const next: InquiryWizardUiState = { ...current, ...patch };

  if (patch.drafts !== undefined) {
    next.drafts =
      patch.drafts && Object.keys(patch.drafts).length > 0 ? patch.drafts : undefined;
  }
  if (patch.dirty !== undefined) {
    next.dirty =
      patch.dirty && Object.keys(patch.dirty).length > 0 ? patch.dirty : undefined;
  }

  next.updated_at = new Date().toISOString();
  return next;
}

export async function saveInquiryWizardUi(
  supabase: SupabaseClient,
  inquiryId: string,
  patch: Partial<InquiryWizardUiState>
): Promise<{ ok: boolean; error?: string }> {
  const id = String(inquiryId || '').trim();
  if (!id) return { ok: false, error: 'Missing inquiry id' };

  const { data: row, error: readErr } = await supabase
    .from('sales_inquiries')
    .select('wizard_ui')
    .eq('id', id)
    .maybeSingle();

  if (readErr) return { ok: false, error: readErr.message };

  const current = parseInquiryWizardUi(
    (row as { wizard_ui?: unknown } | null)?.wizard_ui
  );
  const merged = mergeWizardUiState(current, patch);

  const { error: writeErr } = await supabase
    .from('sales_inquiries')
    .update({ wizard_ui: merged })
    .eq('id', id);

  if (writeErr) return { ok: false, error: writeErr.message };
  return { ok: true };
}

/** Map wizard step dirty flags to pipeline UI stage ids for the stepper. */
export function pipelineStagesWithUnsavedChanges(
  stepDirty: Record<WizardStepId, boolean>
): Set<InquiryPipelineUiStage> {
  const out = new Set<InquiryPipelineUiStage>();
  if (stepDirty[1]) out.add('Enquiry');
  if (stepDirty[2]) out.add('Qualified');
  if (stepDirty[3]) out.add('Site Visit');
  return out;
}

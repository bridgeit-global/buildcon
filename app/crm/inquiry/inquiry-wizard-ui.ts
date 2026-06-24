import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INQUIRY_PIPELINE_UI_STAGES,
  type InquiryPipelineUiStage
} from './inquiry-funnel-stages';
import {
  wizardSnapshotsEqual,
  type WizardSavedSnapshots,
  type WizardStep1Snapshot,
  type WizardStep2Snapshot,
  type WizardStep3Snapshot,
  type WizardStepId
} from './inquiry-wizard-snapshots';

export type InquiryWizardUiDrafts = {
  '1'?: WizardStep1Snapshot;
  '2'?: WizardStep2Snapshot;
  '3'?: WizardStep3Snapshot;
};

/** Persisted on `sales_inquiries.wizard_ui`. */
export type InquiryWizardUiState = {
  view_stage?: InquiryPipelineUiStage;
  wizard_step?: WizardStepId;
  drafts?: InquiryWizardUiDrafts;
  unsaved?: boolean;
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

function legacyDirtyIndicatesUnsaved(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const dirty = raw as Record<string, unknown>;
  return WIZARD_STEP_KEYS.some((key) => dirty[key] === true);
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

  if (typeof o.unsaved === 'boolean') {
    out.unsaved = o.unsaved;
  } else if (legacyDirtyIndicatesUnsaved(o.dirty)) {
    out.unsaved = true;
  }

  if (typeof o.updated_at === 'string' && o.updated_at.trim()) {
    out.updated_at = o.updated_at.trim();
  }

  return out;
}

export function buildWizardUiDraftPayload(
  saved: WizardSavedSnapshots,
  draft: WizardSavedSnapshots
): Pick<InquiryWizardUiState, 'drafts' | 'unsaved'> {
  const drafts: InquiryWizardUiDrafts = {};
  let unsaved = false;

  for (const step of [1, 2, 3] as const) {
    const key = String(step) as keyof InquiryWizardUiDrafts;
    if (!wizardSnapshotsEqual(draft[step], saved[step])) {
      unsaved = true;
      drafts[key] = draft[step] as never;
    }
  }

  return {
    drafts: Object.keys(drafts).length > 0 ? drafts : undefined,
    unsaved: unsaved || undefined
  };
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
  if (patch.unsaved === false) {
    next.unsaved = undefined;
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

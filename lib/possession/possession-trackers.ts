/** Possession & handover checklist trackers (stored in `possession_cases.checklist`). */

export const POSSESSION_TRACKER_IDS = [
  'snag_lists',
  'fit_out_nocs',
  'meter_applications',
  'society_formation',
  'maintenance_deposit',
  'possession_checklist',
  'key_handover'
] as const;

export type PossessionTrackerId = (typeof POSSESSION_TRACKER_IDS)[number];

export const POSSESSION_TRACKER_LABELS: Record<PossessionTrackerId, string> = {
  snag_lists: 'Snag lists',
  fit_out_nocs: 'Fit-out NOCs',
  meter_applications: 'Meter applications',
  society_formation: 'Society formation',
  maintenance_deposit: 'Maintenance deposit',
  possession_checklist: 'Possession checklist',
  key_handover: 'Key handover'
};

export type PossessionChecklistItem = {
  id: PossessionTrackerId;
  label: string;
  done: boolean;
  doneAt?: string | null;
  notes?: string | null;
};

export type PossessionSnagItem = {
  id: string;
  description: string;
  status: 'open' | 'resolved';
  createdAt?: string;
};

export type PossessionWorkflowStage =
  | 'OC'
  | 'FinalDemand'
  | 'PossessionLetter'
  | 'Handover'
  | 'Closed';

export const POSSESSION_WORKFLOW_STAGES: PossessionWorkflowStage[] = [
  'OC',
  'FinalDemand',
  'PossessionLetter',
  'Handover',
  'Closed'
];

export const POSSESSION_WORKFLOW_LABELS: Record<PossessionWorkflowStage, string> = {
  OC: 'OC received',
  FinalDemand: 'Final demand',
  PossessionLetter: 'Possession letter',
  Handover: 'Handover',
  Closed: 'Closed'
};

function isTrackerId(id: string): id is PossessionTrackerId {
  return (POSSESSION_TRACKER_IDS as readonly string[]).includes(id);
}

export function defaultPossessionChecklist(): PossessionChecklistItem[] {
  return POSSESSION_TRACKER_IDS.map((id) => ({
    id,
    label: POSSESSION_TRACKER_LABELS[id],
    done: false,
    doneAt: null,
    notes: null
  }));
}

export function mergePossessionChecklist(raw: unknown): PossessionChecklistItem[] {
  const defaults = defaultPossessionChecklist();
  if (!Array.isArray(raw)) return defaults;

  const byId = new Map<PossessionTrackerId, PossessionChecklistItem>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = String(o.id ?? '').trim();
    if (!isTrackerId(id)) continue;
    byId.set(id, {
      id,
      label:
        typeof o.label === 'string' && o.label.trim()
          ? o.label.trim()
          : POSSESSION_TRACKER_LABELS[id],
      done: Boolean(o.done),
      doneAt: typeof o.doneAt === 'string' ? o.doneAt : null,
      notes: typeof o.notes === 'string' ? o.notes : null
    });
  }

  return defaults.map((d) => byId.get(d.id) ?? d);
}

export function parsePossessionSnagList(raw: unknown): PossessionSnagItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PossessionSnagItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const description = String(o.description ?? '').trim();
    if (!description) continue;
    const status = o.status === 'resolved' ? 'resolved' : 'open';
    out.push({
      id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : crypto.randomUUID(),
      description,
      status,
      createdAt: typeof o.createdAt === 'string' ? o.createdAt : undefined
    });
  }
  return out;
}

export function countChecklistDone(items: PossessionChecklistItem[]): {
  done: number;
  total: number;
} {
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  return { done, total };
}

export function toggleChecklistItem(
  items: PossessionChecklistItem[],
  trackerId: PossessionTrackerId,
  done: boolean
): PossessionChecklistItem[] {
  const now = new Date().toISOString();
  return items.map((item) =>
    item.id === trackerId
      ? { ...item, done, doneAt: done ? now : null }
      : item
  );
}

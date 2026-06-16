import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  POSSESSION_TRACKER_IDS,
  POSSESSION_WORKFLOW_LABELS,
  POSSESSION_WORKFLOW_STAGES,
  countChecklistDone,
  defaultPossessionChecklist,
  mergePossessionChecklist,
  parsePossessionSnagList,
  toggleChecklistItem
} from './possession-trackers';

describe('defaultPossessionChecklist', () => {
  it('creates one unchecked item per tracker', () => {
    const items = defaultPossessionChecklist();
    expect(items).toHaveLength(POSSESSION_TRACKER_IDS.length);
    expect(items.every((i) => i.done === false)).toBe(true);
    expect(items[0]?.label).toBeTruthy();
  });
});

describe('mergePossessionChecklist', () => {
  it('returns defaults for non-array input', () => {
    expect(mergePossessionChecklist(null)).toEqual(defaultPossessionChecklist());
  });

  it('merges saved items by id and ignores unknown ids', () => {
    const merged = mergePossessionChecklist([
      {
        id: 'key_handover',
        done: true,
        doneAt: '2026-01-01T00:00:00.000Z',
        notes: 'Keys handed over'
      },
      { id: 'invalid', done: true }
    ]);
    const keyItem = merged.find((i) => i.id === 'key_handover');
    expect(keyItem?.done).toBe(true);
    expect(keyItem?.notes).toBe('Keys handed over');
    expect(merged).toHaveLength(POSSESSION_TRACKER_IDS.length);
  });
});

describe('parsePossessionSnagList', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '00000000-0000-4000-8000-000000000001'
    });
  });

  it('returns empty array for invalid input', () => {
    expect(parsePossessionSnagList('nope')).toEqual([]);
  });

  it('parses snag items and assigns ids', () => {
    expect(
      parsePossessionSnagList([
        { description: '  Crack in tile  ', status: 'open' },
        { description: '', status: 'resolved' },
        { description: 'Paint chip', status: 'resolved', id: 'snag-1' }
      ])
    ).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000001',
        description: 'Crack in tile',
        status: 'open',
        createdAt: undefined
      },
      {
        id: 'snag-1',
        description: 'Paint chip',
        status: 'resolved',
        createdAt: undefined
      }
    ]);
  });
});

describe('countChecklistDone', () => {
  it('counts done items', () => {
    const items = defaultPossessionChecklist().map((item, idx) =>
      idx < 2 ? { ...item, done: true } : item
    );
    expect(countChecklistDone(items)).toEqual({
      done: 2,
      total: POSSESSION_TRACKER_IDS.length
    });
  });
});

describe('toggleChecklistItem', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets doneAt when marking done and clears when undone', () => {
    const base = defaultPossessionChecklist();
    const done = toggleChecklistItem(base, 'snag_lists', true);
    expect(done.find((i) => i.id === 'snag_lists')).toEqual({
      id: 'snag_lists',
      label: expect.any(String),
      done: true,
      doneAt: '2026-06-15T10:00:00.000Z',
      notes: null
    });
    const undone = toggleChecklistItem(done, 'snag_lists', false);
    expect(undone.find((i) => i.id === 'snag_lists')?.doneAt).toBeNull();
  });
});

describe('workflow constants', () => {
  it('defines stages and labels', () => {
    expect(POSSESSION_WORKFLOW_STAGES).toContain('Handover');
    expect(POSSESSION_WORKFLOW_LABELS.OC).toBe('OC received');
  });
});

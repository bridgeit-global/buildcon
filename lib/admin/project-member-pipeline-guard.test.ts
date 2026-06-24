import { describe, expect, it } from 'vitest';
import {
  buildPipelineBlockedUserIdsForProject,
  buildProjectMemberRemovalBlockSet,
  memberHasOpenPipelineUnit,
  projectMemberRemovalKey
} from './project-member-pipeline-guard';

describe('memberHasOpenPipelineUnit', () => {
  it('returns false without assigned user or unit', () => {
    expect(
      memberHasOpenPipelineUnit({
        assigned_to: null,
        unit_id: 'u1',
        funnel_stage: 'Qualified',
        stage_data: {}
      })
    ).toBe(false);
    expect(
      memberHasOpenPipelineUnit({
        assigned_to: 'user-1',
        unit_id: null,
        funnel_stage: 'Qualified',
        stage_data: {}
      })
    ).toBe(false);
  });

  it('returns false for closed enquiries', () => {
    expect(
      memberHasOpenPipelineUnit({
        assigned_to: 'user-1',
        unit_id: 'u1',
        funnel_stage: 'Closed',
        stage_data: {}
      })
    ).toBe(false);
    expect(
      memberHasOpenPipelineUnit({
        assigned_to: 'user-1',
        unit_id: 'u1',
        funnel_stage: 'Qualified',
        stage_data: { closed: true }
      })
    ).toBe(false);
  });

  it('returns true for open enquiries with a unit', () => {
    expect(
      memberHasOpenPipelineUnit({
        assigned_to: 'user-1',
        unit_id: 'u1',
        funnel_stage: 'Negotiation',
        stage_data: {}
      })
    ).toBe(true);
  });
});

describe('buildProjectMemberRemovalBlockSet', () => {
  it('maps open pipeline enquiries to project/user keys', () => {
    const blocked = buildProjectMemberRemovalBlockSet([
      {
        project_id: 'p1',
        assigned_to: 'u1',
        unit_id: 'unit-1',
        funnel_stage: 'Qualified',
        stage_data: {}
      },
      {
        project_id: 'p1',
        assigned_to: 'u2',
        unit_id: 'unit-2',
        funnel_stage: 'Closed',
        stage_data: {}
      }
    ]);

    expect(blocked).toEqual(new Set([projectMemberRemovalKey('p1', 'u1')]));
  });
});

describe('buildPipelineBlockedUserIdsForProject', () => {
  it('collects assigned user ids with open pipeline units', () => {
    const blocked = buildPipelineBlockedUserIdsForProject([
      {
        assigned_to: 'u1',
        unit_id: 'unit-1',
        funnel_stage: 'Token',
        stage_data: {}
      },
      {
        assigned_to: 'u2',
        unit_id: 'unit-2',
        funnel_stage: 'Closed',
        stage_data: {}
      }
    ]);

    expect(blocked).toEqual(new Set(['u1']));
  });
});

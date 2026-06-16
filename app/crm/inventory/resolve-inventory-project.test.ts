import { describe, expect, it } from 'vitest';
import { resolveInventoryProjectId } from './resolve-inventory-project';

describe('resolveInventoryProjectId', () => {
  const projects = [{ id: 'proj-a' }, { id: 'proj-b' }, { id: 'proj-c' }];

  it.each([
    ['valid url project id', projects, 'proj-b', 'proj-b'],
    ['invalid url project id falls back to first', projects, 'missing', 'proj-a'],
    ['null url project id falls back to first', projects, null, 'proj-a'],
    ['empty url project id falls back to first', projects, '', 'proj-a'],
    ['empty projects returns empty string', [], 'proj-a', ''],
    ['empty projects and null url returns empty string', [], null, '']
  ] as const)(
    '%s',
    (_label, projectList, urlProjectId, expected) => {
      expect(resolveInventoryProjectId(projectList, urlProjectId)).toBe(expected);
    }
  );

  it('prefers first project when url id is not in list', () => {
    expect(resolveInventoryProjectId(projects, 'proj-z')).toBe('proj-a');
  });

  it('returns matching id even when it is not the first project', () => {
    expect(resolveInventoryProjectId(projects, 'proj-c')).toBe('proj-c');
  });
});

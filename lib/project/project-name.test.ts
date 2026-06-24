import { describe, expect, it } from 'vitest';
import {
  isProjectNameTaken,
  normalizeProjectNameKey,
  projectNameDuplicateError,
  PROJECT_NAME_DUPLICATE_ERROR
} from './project-name';

const existing = [
  { id: 'p1', name: 'Sunrise Heights' },
  { id: 'p2', name: 'Green Valley' }
];

describe('normalizeProjectNameKey', () => {
  it('trims and lowercases', () => {
    expect(normalizeProjectNameKey('  Sunrise Heights  ')).toBe('sunrise heights');
  });
});

describe('isProjectNameTaken', () => {
  it('detects duplicate names case-insensitively', () => {
    expect(isProjectNameTaken('sunrise heights', existing)).toBe(true);
    expect(isProjectNameTaken('SUNRISE HEIGHTS', existing)).toBe(true);
  });

  it('ignores the excluded project id', () => {
    expect(isProjectNameTaken('Sunrise Heights', existing, 'p1')).toBe(false);
  });

  it('returns false for a new name', () => {
    expect(isProjectNameTaken('Lake View', existing)).toBe(false);
  });
});

describe('projectNameDuplicateError', () => {
  it('returns duplicate message when taken', () => {
    expect(projectNameDuplicateError('Green Valley', existing)).toBe(
      PROJECT_NAME_DUPLICATE_ERROR
    );
  });

  it('returns null for available names', () => {
    expect(projectNameDuplicateError('New Project', existing)).toBeNull();
  });
});

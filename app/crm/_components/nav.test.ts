import { describe, expect, it } from 'vitest';
import {
  CRM_NAV_GROUPS,
  flattenCrmNav,
  getDefaultNavSectionOpen,
  matchCrmNavItem,
  readNavSectionOpenFromStorage
} from './nav';

describe('flattenCrmNav', () => {
  it('returns all nav items from groups', () => {
    const flat = flattenCrmNav();
    const groupCount = CRM_NAV_GROUPS.reduce((n, g) => n + g.items.length, 0);
    expect(flat).toHaveLength(groupCount);
    expect(flat.some((item) => item.id === 'dashboard')).toBe(true);
    expect(flat.some((item) => item.id === 'inventory')).toBe(true);
  });
});

describe('matchCrmNavItem', () => {
  const items = flattenCrmNav();

  it('matches exact href', () => {
    expect(matchCrmNavItem('/crm/dashboard', items)?.id).toBe('dashboard');
  });

  it('matches longest prefix for nested routes', () => {
    expect(matchCrmNavItem('/crm/project/create', items)?.id).toBe('project');
    expect(matchCrmNavItem('/crm/inventory/unit-123', items)?.id).toBe('inventory');
  });

  it('returns null when no route matches', () => {
    expect(matchCrmNavItem('/crm/unknown', items)).toBeNull();
  });
});

describe('getDefaultNavSectionOpen', () => {
  it('opens sections unless defaultCollapsed is set', () => {
    const defaults = getDefaultNavSectionOpen();
    for (const group of CRM_NAV_GROUPS) {
      expect(defaults[group.id]).toBe(!group.defaultCollapsed);
    }
  });
});

describe('readNavSectionOpenFromStorage', () => {
  it('returns null in node environment without window', () => {
    expect(readNavSectionOpenFromStorage()).toBeNull();
  });
});

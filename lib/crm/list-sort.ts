import type { SortingState } from '@tanstack/react-table';

export const DEFAULT_LIST_SORTING: SortingState = [{ id: 'created_at', desc: true }];

export function sortingStateToQuery(sorting: SortingState): {
  sort?: string;
  sortDir?: 'asc' | 'desc';
} {
  const first = sorting[0];
  if (!first) return {};
  return { sort: first.id, sortDir: first.desc ? 'desc' : 'asc' };
}

export function resolveDbSort(
  sortId: string | null,
  sortDir: string | null,
  allowed: Record<string, string>,
  defaultColumn: string,
  defaultAscending: boolean
): { column: string; ascending: boolean } {
  if (sortId && sortId in allowed) {
    return {
      column: allowed[sortId]!,
      ascending: sortDir !== 'desc'
    };
  }
  return { column: defaultColumn, ascending: defaultAscending };
}

export function resolveSortFromState(
  sorting: SortingState,
  allowed: Record<string, string>,
  defaultColumn: string,
  defaultAscending: boolean
): { column: string; ascending: boolean } {
  const { sort, sortDir } = sortingStateToQuery(sorting);
  return resolveDbSort(sort ?? null, sortDir ?? null, allowed, defaultColumn, defaultAscending);
}

export function sortRowsByState<T>(
  rows: T[],
  sorting: SortingState,
  getValue: (row: T, columnId: string) => string | number | null | undefined
): T[] {
  const first = sorting[0];
  if (!first) return rows;
  const mult = first.desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = getValue(a, first.id);
    const bv = getValue(b, first.id);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') {
      return (av - bv) * mult;
    }
    return (
      String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) *
      mult
    );
  });
}

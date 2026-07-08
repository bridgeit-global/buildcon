'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MasterLookupItem, MasterLookupKind } from './master-lookup';
import { sortMasterLookupItems } from './master-lookup';

type UseMasterLookupOptions = {
  /** Include inactive items (admin screens). Default false. */
  includeInactive?: boolean;
};

export function useMasterLookup(
  kind: MasterLookupKind,
  options: UseMasterLookupOptions = {}
) {
  const { includeInactive = false } = options;
  const [items, setItems] = useState<MasterLookupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ kind });
      if (includeInactive) params.set('includeInactive', '1');
      const res = await fetch(`/api/crm/master-lookup?${params.toString()}`);
      const body = (await res.json()) as {
        error?: string;
        items?: MasterLookupItem[];
      };
      if (!res.ok) throw new Error(body.error || 'Failed to load master data');
      setItems(sortMasterLookupItems(body.items ?? []));
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : 'Failed to load master data');
    } finally {
      setLoading(false);
    }
  }, [kind, includeInactive]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const activeNames = items
    .filter((item) => item.is_active)
    .map((item) => item.name);

  return { items, activeNames, loading, error, reload };
}

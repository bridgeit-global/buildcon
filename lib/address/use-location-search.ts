'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocationSearchResult } from './forward-geocode';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

export function useLocationSearch(query: string) {
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      abortRef.current?.abort();
      setResults([]);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/address/search?q=${encodeURIComponent(trimmed)}`,
        { signal: ctrl.signal }
      );
      if (!res.ok) {
        setResults([]);
        return;
      }
      const data = (await res.json()) as { results?: LocationSearchResult[] };
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch {
      if (!ctrl.signal.aborted) setResults([]);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      abortRef.current?.abort();
      setResults([]);
      setLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void search(trimmed);
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query, search]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { results, loading, minQueryLength: MIN_QUERY_LENGTH };
}

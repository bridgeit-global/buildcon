'use client';

import { useCallback, useRef, useState } from 'react';
import { lookupPincode, type PincodeLookupResult } from './pincode-lookup';

export type PincodeLookupState = {
  loading: boolean;
  result: PincodeLookupResult | null;
};

/**
 * Hook that triggers a pincode lookup when a 6-digit pin is entered.
 * Returns the fetched city/state and a handler to call on pin change.
 * The `onResult` callback is invoked with city & state for the caller
 * to patch its own form state.
 */
export function usePincodeLookup(
  onResult?: (result: PincodeLookupResult) => void
) {
  const [state, setState] = useState<PincodeLookupState>({
    loading: false,
    result: null
  });
  const abortRef = useRef<AbortController | null>(null);

  const handlePinChange = useCallback(
    (pin: string) => {
      const cleaned = pin.replace(/\D/g, '');
      if (cleaned.length !== 6) {
        setState({ loading: false, result: null });
        return;
      }

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setState((s) => ({ ...s, loading: true }));

      lookupPincode(cleaned).then((res) => {
        if (ctrl.signal.aborted) return;
        setState({ loading: false, result: res });
        if (res && onResult) onResult(res);
      });
    },
    [onResult]
  );

  return { ...state, handlePinChange };
}

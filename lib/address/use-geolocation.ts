'use client';

import { useCallback, useRef, useState } from 'react';
import { pageError } from '@/lib/toast';

function geolocationErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return 'Location permission denied. Allow location access in your browser settings.';
    case 2:
      return 'Could not determine your position. Try again or enter location manually.';
    case 3:
      return 'Location request timed out. Try again or enter location manually.';
    default:
      return 'Could not get your location. Enter it manually.';
  }
}

export function useGeolocation() {
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const detectLocation = useCallback(async (): Promise<string | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      pageError('Geolocation is not supported in this browser.');
      return null;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 120000
        });
      });

      if (ctrl.signal.aborted) return null;

      const { latitude, longitude } = position.coords;
      const res = await fetch(
        `/api/address/reverse-geocode?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
        { signal: ctrl.signal }
      );

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        pageError(body?.error ?? 'Could not resolve your location. Enter it manually.');
        return null;
      }

      const data = (await res.json()) as { location?: string };
      const location = data.location?.trim();
      if (!location) {
        pageError('Could not resolve your location. Enter it manually.');
        return null;
      }

      return location;
    } catch (err) {
      if (ctrl.signal.aborted) return null;
      if (err instanceof GeolocationPositionError) {
        pageError(geolocationErrorMessage(err.code));
        return null;
      }
      pageError('Could not get your location. Enter it manually.');
      return null;
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  return { loading, detectLocation };
}

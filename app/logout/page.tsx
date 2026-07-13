'use client';

import { useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function LogoutPage() {
  useEffect(() => {
    let cancelled = false;

    const goToLogin = () => {
      if (cancelled) return;
      // Full navigation so cookie/session changes apply reliably (Supabase SSR).
      window.location.replace('/');
    };

    // If signOut hangs (network), still leave this page.
    const timeoutId = window.setTimeout(goToLogin, 5000);

    try {
      const supabase = createSupabaseBrowserClient();
      void supabase.auth
        .signOut()
        .catch(() => {})
        .finally(() => {
          window.clearTimeout(timeoutId);
          goToLogin();
        });
    } catch {
      window.clearTimeout(timeoutId);
      goToLogin();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
      Signing out…
    </div>
  );
}


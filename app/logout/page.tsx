'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .signOut()
      .catch(() => {})
      .finally(() => {
        router.replace('/login');
        router.refresh();
      });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
      Signing out…
    </div>
  );
}


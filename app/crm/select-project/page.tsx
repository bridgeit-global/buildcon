'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SelectProjectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/crm/dashboard');
  }, [router]);

  return null;
}

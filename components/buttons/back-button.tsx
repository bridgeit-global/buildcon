'use client';

import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

const BackButton = ({ href, label }: { href: string; label?: string }) => {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => router.push(href)}
      className="gap-1.5 text-ds-gray-600 hover:text-ds-gray-900"
    >
      <ArrowLeft className="size-4" />
      {label}
    </Button>
  );
};

export default BackButton;

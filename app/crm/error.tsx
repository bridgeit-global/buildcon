'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/error-state';

export default function CrmError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="p-4 sm:p-6">
      <ErrorState
        title="This page couldn’t load"
        description={
          error.message?.trim()
            ? error.message
            : 'An unexpected error occurred. You can try again or navigate to another section.'
        }
        onRetry={reset}
      />
    </div>
  );
}

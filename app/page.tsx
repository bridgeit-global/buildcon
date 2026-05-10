import { Suspense } from 'react';
import { LoginClient } from './login/login-client';

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
          Loading…
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}

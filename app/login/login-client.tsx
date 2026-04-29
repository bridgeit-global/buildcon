'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/crm';

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');

  async function submit() {
    setBusy(true);
    setError('');
    try {
      if (mode === 'sign_in') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password
        });
        if (error) throw error;
      }
      router.replace(redirectTo);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-blue-50 to-white p-4 flex items-center justify-center">
      <div className="w-full max-w-md rounded-xl border bg-white shadow-sm p-6">
        <div className="mb-6">
          <div className="text-lg font-semibold text-gray-900">BuildCon CRM</div>
          <div className="text-sm text-gray-500">
            Sign in with your staff account.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { id: 'sign_in', label: 'Sign in' },
            { id: 'sign_up', label: 'Sign up' }
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMode(t.id as 'sign_in' | 'sign_up')}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                mode === t.id
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              placeholder="name@company.com"
              autoComplete="email"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Password</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              placeholder="••••••••"
              type="password"
              autoComplete={
                mode === 'sign_in' ? 'current-password' : 'new-password'
              }
            />
          </label>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={submit}
            disabled={busy || !email || !password}
            className={cn(
              'mt-2 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors',
              busy || !email || !password
                ? 'bg-blue-300'
                : 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            {busy ? 'Please wait…' : mode === 'sign_in' ? 'Sign in' : 'Sign up'}
          </button>

          <div className="text-xs text-gray-500">
            After sign-up, your admin should grant you access to projects via
            `project_members`.
          </div>
        </div>
      </div>
    </div>
  );
}


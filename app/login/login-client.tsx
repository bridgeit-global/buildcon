'use client';

import { useMemo, useState } from 'react';
import { pageError } from '@/lib/toast';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { EmailInputField } from '@/components/ui/email-input-field';
import { Input } from '@/components/ui/input';

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/crm';

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
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
      pageError(e instanceof Error ? e.message : 'Login failed');
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
            <Button
              key={t.id}
              onClick={() => setMode(t.id as 'sign_in' | 'sign_up')}
              variant={mode === t.id ? 'default' : 'outline'}
            >
              {t.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <EmailInputField
            value={email}
            onChange={setEmail}
            placeholder="name@company.com"
          />

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Password</span>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              autoComplete={
                mode === 'sign_in' ? 'current-password' : 'new-password'
              }
            />
          </label>

          <Button
            onClick={submit}
            disabled={busy || !email || !password}
            variant={busy || !email || !password ? 'outline' : 'default'}
          >
            {busy ? 'Please wait…' : mode === 'sign_in' ? 'Sign in' : 'Sign up'}
          </Button>

          <div className="text-xs text-gray-500">
            After sign-up, your admin should grant you access to projects via
            `project_members`.
          </div>
        </div>
      </div>
    </div>
  );
}


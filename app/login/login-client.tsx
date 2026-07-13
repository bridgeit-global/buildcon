'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { pageError, toast } from '@/lib/toast';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { EmailInputField } from '@/components/ui/email-input-field';
import { TextInputField } from '@/components/ui/text-input-field';

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/crm';

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();

  function validateLoginFields() {
    const trimmedEmail = email.trim();
    const nextEmailError = !trimmedEmail
      ? 'Email is required.'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
        ? 'Enter a valid email address.'
        : undefined;
    const nextPasswordError = !password
      ? 'Password is required.'
      : password.length < 6
        ? 'Password must be at least 6 characters.'
        : undefined;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    return !nextEmailError && !nextPasswordError;
  }

  async function submit() {
    if (!validateLoginFields()) return;
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
        toast.info(
          'After sign-up, your admin should grant you access to projects via Project Members.'
        );
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
    <div className="min-h-screen bg-linear-to-b from-ds-primary-25 to-background p-4 flex items-center justify-center">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-sm p-6">
        <div className="mb-6">
          <div className="text-lg font-semibold text-foreground">BuildCon CRM</div>
          <div className="text-sm text-muted-foreground">
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

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <EmailInputField
            value={email}
            onChange={(v) => {
              setEmail(v);
              if (emailError) setEmailError(undefined);
            }}
            error={emailError}
            placeholder="name@company.com"
          />

          <TextInputField
            label="Password"
            labelClassName="text-xs font-medium text-ds-gray-600"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) setPasswordError(undefined);
            }}
            onBlur={() => {
              if (password) validateLoginFields();
            }}
            error={passwordError}
            placeholder="••••••••"
            type="password"
            autoComplete={
              mode === 'sign_in' ? 'current-password' : 'new-password'
            }
          />

          <Button type="submit" disabled={busy} className="min-h-11">
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {mode === 'sign_in' ? 'Signing in…' : 'Signing up…'}
              </>
            ) : mode === 'sign_in' ? (
              'Sign in'
            ) : (
              'Sign up'
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            By continuing, you agree to our{' '}
            <Link
              href="/terms-of-service"
              className="font-medium text-ds-primary-600 hover:text-ds-primary-700"
            >
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link
              href="/privacy-policy"
              className="font-medium text-ds-primary-600 hover:text-ds-primary-700"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      </div>
    </div>
  );
}


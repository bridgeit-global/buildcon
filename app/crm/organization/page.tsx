'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isOrgAdmin } from '@/lib/profile-roles';
import { CrmFormSkeleton } from '../_components/crm-skeletons';
import { TextInputField } from '@/components/ui/text-input-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { Button } from '@/components/ui/button';
import { useFieldValidation } from '@/lib/form/zod-field-errors';
import { pageError, toast } from '@/lib/toast';
import {
  EMPTY_ORGANIZATION_SETTINGS_FORM,
  organizationSettingsFormFromRow,
  organizationSettingsFormSchema,
  type OrganizationSettingsFormField,
  type OrganizationSettingsFormValues
} from '@/lib/organization/organization-settings.schema';
import type { OrganizationSettings } from '@/lib/organization/organization-settings';

type OrgApiResponse = {
  organization?: OrganizationSettings;
  logoUrl?: string | null;
  error?: string;
};

const FIELD_IDS: Record<OrganizationSettingsFormField, string> = {
  legal_name: 'org-legal-name',
  trade_name: 'org-trade-name',
  registered_address: 'org-registered-address',
  city: 'org-city',
  state: 'org-state',
  pin: 'org-pin',
  phone: 'org-phone',
  email: 'org-email',
  website: 'org-website',
  pan: 'org-pan',
  gstin: 'org-gstin',
  cin: 'org-cin',
  rera_promoter_no: 'org-rera',
  authorized_signatory_name: 'org-signatory',
  bank_name: 'org-bank-name',
  bank_account_name: 'org-bank-account-name',
  bank_account_no: 'org-bank-account-no',
  bank_ifsc: 'org-bank-ifsc',
  notes: 'org-notes'
};

export default function OrganizationPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [form, setForm] = useState<OrganizationSettingsFormValues>(
    EMPTY_ORGANIZATION_SETTINGS_FORM
  );

  const {
    fieldError,
    touch,
    validate,
    resetValidation,
    submitAttempted,
    errors
  } = useFieldValidation<
    OrganizationSettingsFormField,
    OrganizationSettingsFormValues
  >(organizationSettingsFormSchema, form);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/crm/dashboard');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled && !isOrgAdmin(profile?.role)) {
        router.replace('/crm/dashboard');
        return;
      }

      const res = await fetch('/api/crm/organization');
      const json = (await res.json()) as OrgApiResponse;
      if (!cancelled) {
        if (!res.ok) {
          pageError(json.error ?? 'Failed to load organization details');
        } else if (json.organization) {
          setForm(organizationSettingsFormFromRow(json.organization));
          setLogoUrl(json.logoUrl ?? null);
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  function setField<K extends keyof OrganizationSettingsFormValues>(
    key: K,
    value: OrganizationSettingsFormValues[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function focusFirstError(
    nextErrors: Partial<Record<OrganizationSettingsFormField, string>>
  ) {
    const first = (
      Object.keys(FIELD_IDS) as OrganizationSettingsFormField[]
    ).find((key) => nextErrors[key]);
    if (!first) return;
    const el = document.getElementById(FIELD_IDS[first]);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el instanceof HTMLElement) el.focus();
  }

  async function onSave() {
    const parsed = validate();
    if (!parsed.success) {
      const nextErrors = Object.fromEntries(
        parsed.error.issues
          .filter((issue) => typeof issue.path[0] === 'string')
          .map((issue) => [String(issue.path[0]), issue.message])
      ) as Partial<Record<OrganizationSettingsFormField, string>>;
      pageError(parsed.error.issues[0]?.message ?? 'Fix the highlighted fields.');
      // Defer until submitAttempted paint so invalid styles are visible.
      window.setTimeout(() => focusFirstError(nextErrors), 0);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/crm/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data)
      });
      const json = (await res.json()) as OrgApiResponse;
      if (!res.ok) {
        pageError(json.error ?? 'Failed to save organization details');
        return;
      }
      if (json.organization) {
        setForm(organizationSettingsFormFromRow(json.organization));
        if (json.logoUrl !== undefined) setLogoUrl(json.logoUrl);
        resetValidation();
      }
      toast.success('Organization details saved.');
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function onLogoSelected(file: File | null) {
    if (!file) return;
    setLogoBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/crm/organization/logo', {
        method: 'POST',
        body
      });
      const json = (await res.json()) as OrgApiResponse;
      if (!res.ok) {
        pageError(json.error ?? 'Failed to upload logo');
        return;
      }
      setLogoUrl(json.logoUrl ?? null);
      toast.success('Brand logo updated.');
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to upload logo');
    } finally {
      setLogoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function onRemoveLogo() {
    setLogoBusy(true);
    try {
      const res = await fetch('/api/crm/organization/logo', { method: 'DELETE' });
      const json = (await res.json()) as OrgApiResponse;
      if (!res.ok) {
        pageError(json.error ?? 'Failed to remove logo');
        return;
      }
      setLogoUrl(null);
      toast.success('Brand logo removed.');
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to remove logo');
    } finally {
      setLogoBusy(false);
    }
  }

  if (loading) {
    return <CrmFormSkeleton />;
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="rounded-xl border border-ds-gray-200 bg-card p-4 shadow-sm sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave();
        }}
        noValidate
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ds-gray-900">
              Organization (builder / developer)
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-ds-gray-500">
              Legal entity and brand details used across the CRM and on generated
              receipts, agreements, and letters. Trade name appears as the
              developer brand on documents.
            </p>
          </div>
          <Button
            type="submit"
            className="min-h-11 shrink-0"
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>

        <section className="mt-6 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ds-gray-500">
            Brand logo
          </h3>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-ds-gray-200 bg-ds-gray-50 p-2">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Brand logo"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="px-2 text-center text-xs text-ds-gray-400">
                  No logo uploaded
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-xs text-ds-gray-500">
                Shown on receipts, agreements, letters, and the CRM sidebar. PNG,
                JPG, WebP, or SVG up to 2 MB.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="sr-only"
                  onChange={(e) =>
                    void onLogoSelected(e.target.files?.[0] ?? null)
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={logoBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {logoBusy ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
                </Button>
                {logoUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 text-ds-error-600"
                    disabled={logoBusy}
                    onClick={() => void onRemoveLogo()}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ds-gray-500">
            Identity
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField
              id={FIELD_IDS.legal_name}
              label="Legal name"
              required
              value={form.legal_name}
              error={fieldError('legal_name')}
              onBlur={() => touch('legal_name')}
              onChange={(e) => setField('legal_name', e.target.value)}
            />
            <TextInputField
              id={FIELD_IDS.trade_name}
              label="Trade / brand name"
              required
              value={form.trade_name}
              error={fieldError('trade_name')}
              onBlur={() => touch('trade_name')}
              onChange={(e) => setField('trade_name', e.target.value)}
            />
            <TextInputField
              id={FIELD_IDS.authorized_signatory_name}
              label="Authorised signatory"
              value={form.authorized_signatory_name}
              error={fieldError('authorized_signatory_name')}
              onBlur={() => touch('authorized_signatory_name')}
              onChange={(e) =>
                setField('authorized_signatory_name', e.target.value)
              }
            />
            <TextInputField
              id={FIELD_IDS.rera_promoter_no}
              label="RERA promoter registration"
              value={form.rera_promoter_no}
              error={fieldError('rera_promoter_no')}
              onBlur={() => touch('rera_promoter_no')}
              onChange={(e) => setField('rera_promoter_no', e.target.value)}
            />
          </div>
          <TextareaField
            id={FIELD_IDS.registered_address}
            label="Registered office address"
            rows={3}
            value={form.registered_address}
            error={fieldError('registered_address')}
            onBlur={() => touch('registered_address')}
            onChange={(e) => setField('registered_address', e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInputField
              id={FIELD_IDS.city}
              label="City"
              value={form.city}
              error={fieldError('city')}
              onBlur={() => touch('city')}
              onChange={(e) => setField('city', e.target.value)}
            />
            <TextInputField
              id={FIELD_IDS.state}
              label="State"
              value={form.state}
              error={fieldError('state')}
              onBlur={() => touch('state')}
              onChange={(e) => setField('state', e.target.value)}
            />
            <TextInputField
              id={FIELD_IDS.pin}
              label="PIN"
              value={form.pin}
              error={fieldError('pin')}
              onBlur={() => touch('pin')}
              onChange={(e) => setField('pin', e.target.value)}
              inputMode="numeric"
              maxLength={6}
            />
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ds-gray-500">
            Contact
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField
              id={FIELD_IDS.phone}
              label="Phone"
              value={form.phone}
              error={fieldError('phone')}
              onBlur={() => touch('phone')}
              onChange={(e) => setField('phone', e.target.value)}
              inputMode="tel"
              maxLength={14}
            />
            <TextInputField
              id={FIELD_IDS.email}
              label="Email"
              value={form.email}
              error={fieldError('email')}
              onBlur={() => touch('email')}
              onChange={(e) => setField('email', e.target.value)}
              type="email"
            />
            <TextInputField
              id={FIELD_IDS.website}
              className="sm:col-span-2"
              label="Website"
              value={form.website}
              error={fieldError('website')}
              onBlur={() => touch('website')}
              onChange={(e) => setField('website', e.target.value)}
              placeholder="https://example.com"
            />
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ds-gray-500">
            Tax &amp; registration
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField
              id={FIELD_IDS.pan}
              label="PAN"
              value={form.pan}
              error={fieldError('pan')}
              onBlur={() => touch('pan')}
              onChange={(e) => setField('pan', e.target.value.toUpperCase())}
              maxLength={10}
            />
            <TextInputField
              id={FIELD_IDS.gstin}
              label="GSTIN"
              value={form.gstin}
              error={fieldError('gstin')}
              onBlur={() => touch('gstin')}
              onChange={(e) => setField('gstin', e.target.value.toUpperCase())}
              maxLength={15}
            />
            <TextInputField
              id={FIELD_IDS.cin}
              className="sm:col-span-2"
              label="CIN / LLPIN"
              value={form.cin}
              error={fieldError('cin')}
              onBlur={() => touch('cin')}
              onChange={(e) => setField('cin', e.target.value.toUpperCase())}
            />
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ds-gray-500">
            Bank details (receipts)
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInputField
              id={FIELD_IDS.bank_name}
              label="Bank name"
              value={form.bank_name}
              error={fieldError('bank_name')}
              onBlur={() => touch('bank_name')}
              onChange={(e) => setField('bank_name', e.target.value)}
            />
            <TextInputField
              id={FIELD_IDS.bank_account_name}
              label="Account name"
              value={form.bank_account_name}
              error={fieldError('bank_account_name')}
              onBlur={() => touch('bank_account_name')}
              onChange={(e) => setField('bank_account_name', e.target.value)}
            />
            <TextInputField
              id={FIELD_IDS.bank_account_no}
              label="Account number"
              value={form.bank_account_no}
              error={fieldError('bank_account_no')}
              onBlur={() => touch('bank_account_no')}
              onChange={(e) => setField('bank_account_no', e.target.value)}
              inputMode="numeric"
              maxLength={18}
            />
            <TextInputField
              id={FIELD_IDS.bank_ifsc}
              label="IFSC"
              value={form.bank_ifsc}
              error={fieldError('bank_ifsc')}
              onBlur={() => touch('bank_ifsc')}
              onChange={(e) =>
                setField('bank_ifsc', e.target.value.toUpperCase())
              }
              maxLength={11}
            />
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ds-gray-500">
            Notes
          </h3>
          <TextareaField
            id={FIELD_IDS.notes}
            label="Internal notes"
            rows={3}
            value={form.notes}
            error={fieldError('notes')}
            onBlur={() => touch('notes')}
            onChange={(e) => setField('notes', e.target.value)}
          />
        </section>

        {submitAttempted && Object.keys(errors).length > 0 ? (
          <p className="mt-4 text-xs text-ds-error-600" role="status">
            Fix the highlighted fields before saving.
          </p>
        ) : null}

        <div className="mt-6 flex justify-end sm:hidden">
          <Button
            type="submit"
            className="min-h-11 w-full"
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}

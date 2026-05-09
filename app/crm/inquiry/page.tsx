'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const INTEREST_TYPES = [
  '1RK',
  '1BHK',
  '1.5BHK',
  '2BHK',
  '2.5BHK',
  '3BHK',
  '3.5BHK',
  '4BHK',
  '5BHK',
  'Studio',
  'Duplex',
  'Penthouse',
  'Shop',
  'Office'
] as const;

const LEAD_SOURCES = [
  'Direct',
  'Broker',
  'Referral',
  'Social Media',
  'Website',
  'Walk-in'
] as const;

function normalizePhone(p: string) {
  return String(p || '').replace(/\D/g, '');
}

function inquiryReference(id: string) {
  const compact = id.replace(/-/g, '');
  return `INQ-${compact.slice(0, 10).toUpperCase()}`;
}

type UnitRow = {
  id: string;
  unit_code: string;
  wing_name: string;
  floor: number;
  unit_no: number;
  unit_type: string | null;
  area: number | null;
  rate: number | null;
  status: string;
};

function unitDisplayName(u: Pick<UnitRow, 'unit_code' | 'wing_name'>) {
  return `${u.unit_code} · ${u.wing_name}`;
}

function unitPriceLacs(u: UnitRow) {
  const total =
    ((Number(u.area) || 0) * (Number(u.rate) || 0)) / 100_000;
  return Math.round(total);
}

const selectClass =
  'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

type CustomerEmbed = {
  full_name: string;
  phone: string | null;
  email: string | null;
};
type UnitEmbed = { unit_code: string; wing_name: string };
type ProfileEmbed = { name: string | null };

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

type InquiryRowDb = {
  id: string;
  created_at: string;
  lead_source: string;
  interested_in: string | null;
  parking_required: string;
  parking_count: string;
  notes: string | null;
  customer_id: string;
  unit_id: string;
  customers: CustomerEmbed | CustomerEmbed[] | null;
  units: UnitEmbed | UnitEmbed[] | null;
  profiles: ProfileEmbed | ProfileEmbed[] | null;
};

export default function InquiryPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { activeProjectId } = useActiveProjectContext();

  const [query, setQuery] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [inquiries, setInquiries] = useState<InquiryRowDb[]>([]);
  const [loadingInquiries, setLoadingInquiries] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userLabel, setUserLabel] = useState<{ id: string; name: string }>({
    id: '',
    name: 'Logged-in user'
  });

  const [sellerForm, setSellerForm] = useState({
    customerName: '',
    phone: '',
    email: '',
    leadSource: 'Direct' as (typeof LEAD_SOURCES)[number],
    interestedIn: '',
    parkingRequired: 'No' as 'Yes' | 'No',
    parkingCount: '1',
    selectedUnitId: '',
    notes: ''
  });

  const loadInquiries = useCallback(async () => {
    if (!activeProjectId) return;
    setLoadingInquiries(true);
    setError('');
    const { data, error: qErr } = await supabase
      .from('sales_inquiries')
      .select(
        `
        id,
        created_at,
        lead_source,
        interested_in,
        parking_required,
        parking_count,
        notes,
        customer_id,
        unit_id,
        customers ( full_name, phone, email ),
        units ( unit_code, wing_name ),
        profiles ( name )
      `
      )
      .eq('project_id', activeProjectId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (qErr) {
      setError(qErr.message);
      setInquiries([]);
    } else {
      setInquiries((data ?? []) as unknown as InquiryRowDb[]);
    }
    setLoadingInquiries(false);
  }, [activeProjectId, supabase]);

  useEffect(() => {
    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const email = user?.email ?? '';
      const name =
        (user?.user_metadata?.full_name as string | undefined)?.trim() ||
        email ||
        'Logged-in user';
      setUserLabel({ id: user?.id ?? '', name });
    })();
  }, [supabase]);

  useEffect(() => {
    void loadInquiries();
  }, [loadInquiries]);

  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    (async () => {
      setLoadingUnits(true);
      const { data, error: uErr } = await supabase
        .from('units')
        .select(
          'id,unit_code,wing_name,floor,unit_no,unit_type,area,rate,status,project_id'
        )
        .eq('project_id', activeProjectId)
        .order('wing_name', { ascending: true })
        .order('floor', { ascending: false })
        .order('unit_no', { ascending: true })
        .limit(500);
      if (!cancelled && !uErr) {
        setUnits((data ?? []) as UnitRow[]);
      }
      if (!cancelled) setLoadingUnits(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, supabase]);

  const projectId = activeProjectId ?? '';

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return inquiries;
    return inquiries.filter((inq) => {
      const c = embedOne(inq.customers);
      const name = String(c?.full_name || '').toLowerCase();
      const phone = String(c?.phone || '').toLowerCase();
      const email = String(c?.email || '').toLowerCase();
      const unitId = String(inq?.unit_id || '').toLowerCase();
      const u = embedOne(inq.units);
      const unitCode = String(u?.unit_code || '').toLowerCase();
      const source = String(inq.lead_source || '').toLowerCase();
      const ref = inquiryReference(inq.id).toLowerCase();
      return (
        name.includes(q) ||
        phone.includes(q) ||
        email.includes(q) ||
        unitId.includes(q) ||
        unitCode.includes(q) ||
        source.includes(q) ||
        ref.includes(q)
      );
    });
  }, [inquiries, query]);

  const stats = useMemo(() => {
    const total = inquiries.length;
    const todayStr = new Date().toISOString().slice(0, 10);
    const today = inquiries.filter(
      (i) => String(i?.created_at || '').slice(0, 10) === todayStr
    ).length;
    const withUnit = inquiries.filter((i) => String(i?.unit_id || '').trim())
      .length;
    return { total, today, withUnit };
  }, [inquiries]);

  const canSave = useMemo(() => {
    return (
      String(sellerForm.customerName || '').trim().length >= 2 &&
      normalizePhone(sellerForm.phone).length === 10 &&
      String(sellerForm.selectedUnitId || '').trim().length > 0
    );
  }, [sellerForm]);

  const suggestionUnits = useMemo(() => {
    const wantedType = String(sellerForm.interestedIn || '')
      .toLowerCase()
      .replace(/\s+/g, '');
    return (units || [])
      .filter((u) => {
        const st = String(u.status || '').toUpperCase();
        return st === 'A' || st === 'AVAILABLE';
      })
      .filter((u) => {
        if (!wantedType) return true;
        const unitType = String(u.unit_type || '')
          .toLowerCase()
          .replace(/\s+/g, '');
        return unitType.includes(wantedType);
      })
      .slice(0, 8);
  }, [units, sellerForm.interestedIn]);

  const unitNameById = useMemo(() => {
    const map = new Map<string, string>();
    units.forEach((u) => {
      if (!u?.id) return;
      map.set(u.id, unitDisplayName(u));
    });
    return map;
  }, [units]);

  function resetForm() {
    setSellerForm({
      customerName: '',
      phone: '',
      email: '',
      leadSource: 'Direct',
      interestedIn: '',
      parkingRequired: 'No',
      parkingCount: '1',
      selectedUnitId: '',
      notes: ''
    });
  }

  async function saveInquiry() {
    if (!canSave || !projectId || !userLabel.id) return;
    setSaving(true);
    setError('');
    try {
      const digits = normalizePhone(sellerForm.phone);
      const fullName = String(sellerForm.customerName || '').trim();
      const email = String(sellerForm.email || '').trim() || null;

      const { data: existing, error: findErr } = await supabase
        .from('customers')
        .select('id')
        .eq('phone_normalized', digits)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (findErr) throw findErr;

      let customerId: string;
      if (existing?.id) {
        customerId = existing.id;
        const { error: upErr } = await supabase
          .from('customers')
          .update({
            full_name: fullName,
            email,
            phone: digits
          })
          .eq('id', customerId);
        if (upErr) throw upErr;
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from('customers')
          .insert({
            full_name: fullName,
            phone: digits,
            email
          })
          .select('id')
          .single();
        if (insErr) throw insErr;
        customerId = (inserted as { id: string }).id;
      }

      const { error: inqErr } = await supabase.from('sales_inquiries').insert({
        project_id: projectId,
        customer_id: customerId,
        unit_id: sellerForm.selectedUnitId,
        lead_source: sellerForm.leadSource,
        interested_in: sellerForm.interestedIn.trim() || null,
        parking_required: sellerForm.parkingRequired,
        parking_count: sellerForm.parkingCount,
        notes: sellerForm.notes.trim() || null,
        created_by: userLabel.id
      });

      if (inqErr) throw inqErr;

      await loadInquiries();
      resetForm();
      setSaveMsg('Inquiry saved.');
      window.setTimeout(() => setSaveMsg(''), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save inquiry');
    } finally {
      setSaving(false);
    }
  }

  if (!activeProjectId) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Select a project to manage inquiries.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">
              Inquiry list
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Stored in the database with linked customer and unit.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {loadingInquiries ? 'Loading…' : `${inquiries.length} saved`}
            </span>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => void loadInquiries()}
              disabled={loadingInquiries}
            >
              Refresh
            </Button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(
            [
              ['Total inquiries', stats.total],
              ['Created today', stats.today],
              ['Unit selected', stats.withUnit]
            ] as const
          ).map(([k, v]) => (
            <div
              key={k}
              className="rounded-lg border border-border bg-muted/40 px-3 py-2"
            >
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {k}
              </div>
              <div className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                {v}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold text-foreground">
          New inquiry form
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Creates or updates a customer by mobile number, then saves the inquiry.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <Label>Customer name *</Label>
            <Input
              className="mt-1"
              value={sellerForm.customerName}
              onChange={(e) =>
                setSellerForm((s) => ({ ...s, customerName: e.target.value }))
              }
              placeholder="Customer name"
            />
          </div>
          <div>
            <Label>Phone *</Label>
            <Input
              className="mt-1"
              value={sellerForm.phone}
              onChange={(e) =>
                setSellerForm((s) => ({
                  ...s,
                  phone: String(e.target.value || '')
                    .replace(/\D/g, '')
                    .slice(0, 10)
                }))
              }
              placeholder="10-digit mobile"
              inputMode="numeric"
              maxLength={10}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              className="mt-1"
              type="email"
              value={sellerForm.email}
              onChange={(e) =>
                setSellerForm((s) => ({ ...s, email: e.target.value }))
              }
              placeholder="Email"
            />
          </div>
          <div>
            <Label>Lead source</Label>
            <select
              value={sellerForm.leadSource}
              onChange={(e) =>
                setSellerForm((s) => ({
                  ...s,
                  leadSource: e.target.value as (typeof LEAD_SOURCES)[number]
                }))
              }
              className={selectClass}
            >
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Interested in</Label>
            <select
              value={sellerForm.interestedIn}
              onChange={(e) =>
                setSellerForm((s) => ({ ...s, interestedIn: e.target.value }))
              }
              className={selectClass}
            >
              <option value="">All types</option>
              {INTEREST_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Parking</Label>
            <select
              value={sellerForm.parkingRequired}
              onChange={(e) =>
                setSellerForm((s) => ({
                  ...s,
                  parkingRequired: e.target.value as 'Yes' | 'No'
                }))
              }
              className={selectClass}
            >
              <option value="No">No parking required</option>
              <option value="Yes">Parking required</option>
            </select>
          </div>
          <div>
            <Label>Parking count</Label>
            <select
              value={sellerForm.parkingCount}
              onChange={(e) =>
                setSellerForm((s) => ({ ...s, parkingCount: e.target.value }))
              }
              disabled={sellerForm.parkingRequired !== 'Yes'}
              className={cn(selectClass, sellerForm.parkingRequired !== 'Yes' && 'opacity-60')}
            >
              {(['1', '2', '3', '4+'] as const).map((x) => (
                <option key={x} value={x}>
                  Parking count: {x}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 xl:col-span-4">
            <Label>Notes</Label>
            <textarea
              value={sellerForm.notes}
              onChange={(e) =>
                setSellerForm((s) => ({ ...s, notes: e.target.value }))
              }
              rows={2}
              placeholder="Notes"
              className={cn(
                'mt-1 flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-0.5 focus-visible:ring-ring/50 md:text-sm'
              )}
            />
          </div>
        </div>

        <div className="mt-6 text-xs font-semibold text-foreground">
          Suggested units
          {loadingUnits ? (
            <span className="ml-2 font-normal text-muted-foreground">
              Loading inventory…
            </span>
          ) : null}
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          {suggestionUnits.length === 0 ? (
            <div className="col-span-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              No available units match the current interest type.
            </div>
          ) : (
            suggestionUnits.map((u) => {
              const active = sellerForm.selectedUnitId === u.id;
              const lac = unitPriceLacs(u);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() =>
                    setSellerForm((s) => ({ ...s, selectedUnitId: u.id }))
                  }
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    active
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-border bg-background hover:bg-muted/50'
                  )}
                >
                  <div className="text-xs font-bold text-foreground">
                    {u.unit_code}
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {u.unit_type ?? '—'} · {u.wing_name}
                  </div>
                  <div className="mt-1.5 text-xs font-semibold text-foreground">
                    ₹ {lac.toLocaleString('en-IN')} Lac
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={!canSave || saving || !userLabel.id}
            onClick={() => void saveInquiry()}
            className="bg-green-600 hover:bg-green-700"
          >
            {saving ? 'Saving…' : 'Save inquiry'}
          </Button>
          <Button type="button" variant="outline" onClick={resetForm}>
            Reset
          </Button>
          {!userLabel.id ? (
            <span className="text-xs text-amber-700">
              Sign in required to save.
            </span>
          ) : null}
          {saveMsg ? (
            <span className="text-xs font-semibold text-green-700">{saveMsg}</span>
          ) : null}
        </div>
      </Card>

      <Card className="p-4">
        <Label className="sr-only">Search inquiries</Label>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by customer, phone, email, source, or unit"
        />

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {[
                  'Inquiry ID',
                  'Created',
                  'Customer',
                  'Phone',
                  'Email',
                  'Lead source',
                  'Unit',
                  'Seller'
                ].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-2 py-6 text-muted-foreground"
                  >
                    {loadingInquiries
                      ? 'Loading…'
                      : 'No inquiries found for this project.'}
                  </td>
                </tr>
              ) : (
                filtered.map((inq) => {
                  const u = embedOne(inq.units);
                  const unitLabel =
                    u != null
                      ? unitDisplayName(u)
                      : unitNameById.get(inq.unit_id) || inq.unit_id || '—';
                  const sellerName = embedOne(inq.profiles)?.name ?? '—';
                  return (
                    <tr
                      key={inq.id}
                      className="border-b border-border/80"
                    >
                      <td className="whitespace-nowrap px-2 py-2 text-xs font-semibold">
                        {inquiryReference(inq.id)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">
                        {inq.created_at
                          ? new Date(inq.created_at).toLocaleString()
                          : '—'}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {embedOne(inq.customers)?.full_name ?? '—'}
                      </td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {embedOne(inq.customers)?.phone ?? '—'}
                      </td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {embedOne(inq.customers)?.email ?? '—'}
                      </td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {inq.lead_source ?? '—'}
                      </td>
                      <td className="px-2 py-2 text-xs font-semibold">
                        {unitLabel}
                      </td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {sellerName}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

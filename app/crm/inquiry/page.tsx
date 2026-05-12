'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  STATUS_LABEL,
  agreementValueLac,
  formatFloorLabel
} from '../inventory/inventory-utils';

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

/** Maps inquiry parking_count option to a number for cost (4+ → 4). */
function parkingCountNumeric(count: string): number {
  const t = String(count || '').trim();
  if (t === '4+') return 4;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? Math.max(1, n) : 1;
}

type ProjectParkingMeta = {
  parking_slots: number | null;
  parking_rate: number | null;
};

function formatProjectParkingSummary(p: ProjectParkingMeta | null): string {
  if (!p) return '—';
  const s = p.parking_slots;
  const r = p.parking_rate;
  if (s == null || s <= 0) return 'Not configured on project';
  const ratePart =
    r != null && r > 0
      ? ` · ₹${r.toLocaleString('en-IN')} / slot`
      : '';
  return `${s} slot${s !== 1 ? 's' : ''} available${ratePart}`;
}

const selectClass =
  'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

const STEPS = [
  { id: 1, label: 'Customer' },
  { id: 2, label: 'Inquiry' },
  { id: 3, label: 'Unit' },
  { id: 4, label: 'Review' }
] as const;
type StepId = (typeof STEPS)[number]['id'];

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

type BrokerEmbed = { full_name: string };

type InquiryRowDb = {
  id: string;
  created_at: string;
  lead_source: string;
  broker_id: string | null;
  brokers: BrokerEmbed | BrokerEmbed[] | null;
  interested_in: string | null;
  parking_required: string;
  parking_count: string;
  parking_slots_available: number | null;
  parking_rate_snapshot: number | null;
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

  const [brokers, setBrokers] = useState<{ id: string; full_name: string }[]>(
    []
  );
  const [projectParking, setProjectParking] =
    useState<ProjectParkingMeta | null>(null);

  const [sellerForm, setSellerForm] = useState({
    customerName: '',
    phone: '',
    email: '',
    leadSource: 'Direct' as (typeof LEAD_SOURCES)[number],
    brokerId: '',
    interestedIn: '',
    parkingRequired: 'No' as 'Yes' | 'No',
    parkingCount: '1',
    selectedUnitId: '',
    notes: ''
  });

  const [step, setStep] = useState<StepId>(1);

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
        broker_id,
        brokers ( full_name ),
        interested_in,
        parking_required,
        parking_count,
        parking_slots_available,
        parking_rate_snapshot,
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
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('brokers')
        .select('id, full_name')
        .eq('status', 'Active')
        .order('full_name');
      if (!cancelled) setBrokers((data ?? []) as { id: string; full_name: string }[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!activeProjectId) {
      setProjectParking(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingUnits(true);
      const [unitsRes, projRes] = await Promise.all([
        supabase
          .from('units')
          .select(
            'id,unit_code,wing_name,floor,unit_no,unit_type,area,rate,status,project_id'
          )
          .eq('project_id', activeProjectId)
          .order('wing_name', { ascending: true })
          .order('floor', { ascending: false })
          .order('unit_no', { ascending: true })
          .limit(500),
        supabase
          .from('projects')
          .select('parking_slots, parking_rate')
          .eq('id', activeProjectId)
          .maybeSingle()
      ]);
      if (!cancelled && !unitsRes.error) {
        setUnits((unitsRes.data ?? []) as UnitRow[]);
      }
      if (!cancelled && projRes.data) {
        const row = projRes.data as {
          parking_slots: number | null;
          parking_rate: number | null;
        };
        setProjectParking({
          parking_slots: row.parking_slots ?? null,
          parking_rate: row.parking_rate ?? null
        });
      } else if (!cancelled) {
        setProjectParking(null);
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
    const brokerOk =
      sellerForm.leadSource !== 'Broker' ||
      Boolean(String(sellerForm.brokerId || '').trim());
    return (
      String(sellerForm.customerName || '').trim().length >= 2 &&
      normalizePhone(sellerForm.phone).length === 10 &&
      String(sellerForm.selectedUnitId || '').trim().length > 0 &&
      brokerOk
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

  const selectedUnit = useMemo(() => {
    const id = String(sellerForm.selectedUnitId || '').trim();
    if (!id) return null;
    return units.find((u) => u.id === id) ?? null;
  }, [units, sellerForm.selectedUnitId]);

  const stepValid = useMemo(() => {
    const customerOk =
      String(sellerForm.customerName || '').trim().length >= 2 &&
      normalizePhone(sellerForm.phone).length === 10 &&
      Boolean(userLabel.id);
    const inquiryOk =
      sellerForm.leadSource !== 'Broker' ||
      Boolean(String(sellerForm.brokerId || '').trim());
    const unitOk = String(sellerForm.selectedUnitId || '').trim().length > 0;
    return { 1: customerOk, 2: inquiryOk, 3: unitOk, 4: true } as Record<
      StepId,
      boolean
    >;
  }, [sellerForm, userLabel.id]);

  const persistCustomerToDb = useCallback(async (): Promise<string | null> => {
    if (!userLabel.id) {
      setError('Sign in required to save customer details.');
      return null;
    }
    const digits = normalizePhone(sellerForm.phone);
    const fullName = String(sellerForm.customerName || '').trim();
    const email = String(sellerForm.email || '').trim() || null;

    try {
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
      return customerId;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to save customer details'
      );
      return null;
    }
  }, [supabase, userLabel.id, sellerForm.customerName, sellerForm.phone, sellerForm.email]);

  async function goNext() {
    if (!stepValid[step] || saving) return;
    if (step === 1) {
      setSaving(true);
      setError('');
      try {
        const customerId = await persistCustomerToDb();
        if (!customerId) return;
        setStep(2);
        setSaveMsg('Customer details saved.');
        window.setTimeout(() => setSaveMsg(''), 2000);
      } finally {
        setSaving(false);
      }
      return;
    }
    setStep((s) => Math.min(4, (s as number) + 1) as StepId);
  }
  function goBack() {
    setStep((s) => Math.max(1, (s as number) - 1) as StepId);
  }
  async function gotoStep(target: StepId) {
    if (target === step || saving) return;
    if (target < step) {
      setStep(target);
      return;
    }
    if (step === 1 && target > 1) {
      if (!stepValid[1]) {
        setStep(1);
        return;
      }
      setSaving(true);
      setError('');
      try {
        const customerId = await persistCustomerToDb();
        if (!customerId) return;
        setSaveMsg('Customer details saved.');
        window.setTimeout(() => setSaveMsg(''), 2000);
      } finally {
        setSaving(false);
      }
    }
    for (let i = step; i < target; i++) {
      if (!stepValid[i as StepId]) {
        setStep(i as StepId);
        return;
      }
    }
    setStep(target);
  }

  function resetForm() {
    setSellerForm({
      customerName: '',
      phone: '',
      email: '',
      leadSource: 'Direct',
      brokerId: '',
      interestedIn: '',
      parkingRequired: 'No',
      parkingCount: '1',
      selectedUnitId: '',
      notes: ''
    });
    setStep(1);
  }

  async function saveInquiry() {
    if (!canSave || !projectId || !userLabel.id) return;
    setSaving(true);
    setError('');
    try {
      const customerId = await persistCustomerToDb();
      if (!customerId) return;

      const brokerId =
        sellerForm.leadSource === 'Broker' &&
          String(sellerForm.brokerId || '').trim()
          ? sellerForm.brokerId.trim()
          : null;

      const { error: inqErr } = await supabase.from('sales_inquiries').insert({
        project_id: projectId,
        customer_id: customerId,
        unit_id: sellerForm.selectedUnitId,
        lead_source: sellerForm.leadSource,
        broker_id: brokerId,
        interested_in: sellerForm.interestedIn.trim() || null,
        parking_required: sellerForm.parkingRequired,
        parking_count: sellerForm.parkingCount,
        parking_slots_available: projectParking?.parking_slots ?? null,
        parking_rate_snapshot: projectParking?.parking_rate ?? null,
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
        <div className="text-sm font-semibold text-foreground">
          New inquiry form
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Creates or updates a customer by mobile number, then saves the inquiry.
        </div>

        <Stepper
          current={step}
          onStepClick={gotoStep}
          valid={stepValid}
          disabled={saving}
        />

        {step === 1 ? (
          <StepCustomer
            sellerForm={sellerForm}
            setSellerForm={setSellerForm}
            signedIn={Boolean(userLabel.id)}
          />
        ) : null}

        {step === 2 ? (
          <StepInquiry
            sellerForm={sellerForm}
            setSellerForm={setSellerForm}
            brokers={brokers}
            projectParking={projectParking}
          />
        ) : null}

        {step === 3 ? (
          <StepUnit
            sellerForm={sellerForm}
            setSellerForm={setSellerForm}
            suggestionUnits={suggestionUnits}
            loadingUnits={loadingUnits}
            selectedUnit={selectedUnit}
            projectParking={projectParking}
          />
        ) : null}

        {step === 4 ? (
          <StepReview
            sellerForm={sellerForm}
            selectedUnit={selectedUnit}
            brokers={brokers}
            projectParking={projectParking}
          />
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              disabled={step === 1 || saving}
            >
              Back
            </Button>
            <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
              Reset
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {!userLabel.id ? (
              <span className="text-xs text-amber-700">
                Sign in required to save.
              </span>
            ) : null}
            {saveMsg ? (
              <span className="text-xs font-semibold text-green-700">
                {saveMsg}
              </span>
            ) : null}
            {step < 4 ? (
              <Button
                type="button"
                onClick={() => void goNext()}
                disabled={!stepValid[step] || saving}
              >
                {saving && step === 1 ? 'Saving…' : step === 1 ? 'Save & next' : 'Next'}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!canSave || saving || !userLabel.id}
                onClick={() => void saveInquiry()}
                className="bg-green-600 hover:bg-green-700"
              >
                {saving ? 'Saving…' : 'Save inquiry'}
              </Button>
            )}
          </div>
        </div>
      </Card>

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
      <Card className="p-4" id="inquiry-list">
        <Label className="sr-only">Search inquiries</Label>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by customer, phone, email, source, or unit"
        />

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {[
                  'Inquiry ID',
                  'Created',
                  'Customer',
                  'Phone',
                  'Email',
                  'Lead source',
                  'Broker',
                  'Unit',
                  'Parking',
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
                    colSpan={10}
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
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {String(inq.lead_source || '').toLowerCase() ===
                          'broker'
                          ? embedOne(inq.brokers)?.full_name ?? '—'
                          : '—'}
                      </td>
                      <td className="px-2 py-2 text-xs font-semibold">
                        {unitLabel}
                      </td>
                      <td className="max-w-[220px] px-2 py-2 text-[11px] leading-snug">
                        <div className="font-medium text-foreground">
                          {inq.parking_required === 'Yes'
                            ? `Ask × ${inq.parking_count}`
                            : 'No'}
                        </div>
                        {inq.parking_slots_available != null &&
                          inq.parking_slots_available > 0 ? (
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            At save: {inq.parking_slots_available} slots
                            {inq.parking_rate_snapshot != null &&
                              inq.parking_rate_snapshot > 0
                              ? ` @ ₹${inq.parking_rate_snapshot.toLocaleString(
                                'en-IN'
                              )}/slot`
                              : ''}
                          </div>
                        ) : null}
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

type SellerForm = {
  customerName: string;
  phone: string;
  email: string;
  leadSource: (typeof LEAD_SOURCES)[number];
  brokerId: string;
  interestedIn: string;
  parkingRequired: 'Yes' | 'No';
  parkingCount: string;
  selectedUnitId: string;
  notes: string;
};
type SetSellerForm = React.Dispatch<React.SetStateAction<SellerForm>>;

function Stepper({
  current,
  onStepClick,
  valid,
  disabled
}: {
  current: StepId;
  onStepClick: (s: StepId) => void | Promise<void>;
  valid: Record<StepId, boolean>;
  disabled?: boolean;
}) {
  return (
    <ol className="mt-4 flex items-center">
      {STEPS.map((s, idx) => {
        const isDone = s.id < current && valid[s.id];
        const isActive = s.id === current;
        const isLast = idx === STEPS.length - 1;
        return (
          <li
            key={s.id}
            className={cn('flex items-center', !isLast && 'flex-1')}
          >
            <button
              type="button"
              onClick={() => void onStepClick(s.id)}
              disabled={disabled}
              className="group flex items-center gap-2 text-left disabled:pointer-events-none disabled:opacity-50"
              aria-current={isActive ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full border text-[11px] font-bold transition-colors',
                  isDone &&
                  'border-green-500 bg-green-500 text-white',
                  isActive &&
                  'border-blue-500 bg-blue-500 text-white shadow-sm',
                  !isDone &&
                  !isActive &&
                  'border-border bg-background text-muted-foreground group-hover:border-blue-300'
                )}
              >
                {isDone ? '✓' : s.id}
              </span>
              <span
                className={cn(
                  'text-[11px] font-semibold uppercase tracking-wide',
                  isActive
                    ? 'text-foreground'
                    : isDone
                      ? 'text-green-700'
                      : 'text-muted-foreground'
                )}
              >
                {s.label}
              </span>
            </button>
            {!isLast ? (
              <span
                aria-hidden="true"
                className={cn(
                  'mx-3 h-px flex-1 transition-colors',
                  s.id < current ? 'bg-green-400' : 'bg-border'
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StepCustomer({
  sellerForm,
  setSellerForm,
  signedIn
}: {
  sellerForm: SellerForm;
  setSellerForm: SetSellerForm;
  signedIn: boolean;
}) {
  return (
    <div className="mt-6 space-y-3">
      {!signedIn ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Sign in to save customer details to the database and continue to the next
          step.
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Customer is saved when you continue (by phone number — existing customers
          are updated).
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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
      </div>
    </div>
  );
}

function StepInquiry({
  sellerForm,
  setSellerForm,
  brokers,
  projectParking
}: {
  sellerForm: SellerForm;
  setSellerForm: SetSellerForm;
  brokers: { id: string; full_name: string }[];
  projectParking: ProjectParkingMeta | null;
}) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <div className="md:col-span-2 xl:col-span-4 rounded-lg border border-blue-100 bg-blue-50/90 px-3 py-2 text-[11px] text-blue-900">
        <span className="font-semibold">Parking inventory (this project): </span>
        {formatProjectParkingSummary(projectParking)}
      </div>
      <div>
        <Label>Lead source</Label>
        <select
          value={sellerForm.leadSource}
          onChange={(e) => {
            const v = e.target.value as (typeof LEAD_SOURCES)[number];
            setSellerForm((s) => ({
              ...s,
              leadSource: v,
              brokerId: v === 'Broker' ? s.brokerId : ''
            }));
          }}
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
        <Label>Broker</Label>
        <select
          value={sellerForm.brokerId}
          disabled={sellerForm.leadSource !== 'Broker'}
          onChange={(e) =>
            setSellerForm((s) => ({ ...s, brokerId: e.target.value }))
          }
          className={cn(
            selectClass,
            sellerForm.leadSource !== 'Broker' && 'opacity-60'
          )}
        >
          <option value="">Select broker…</option>
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.full_name}
            </option>
          ))}
        </select>
        {sellerForm.leadSource === 'Broker' && brokers.length === 0 ? (
          <p className="mt-1 text-[10px] text-muted-foreground">
            No active brokers. Add one under CRM → Brokers.
          </p>
        ) : null}
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
          className={cn(
            selectClass,
            sellerForm.parkingRequired !== 'Yes' && 'opacity-60'
          )}
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
  );
}

function StepUnit({
  sellerForm,
  setSellerForm,
  suggestionUnits,
  loadingUnits,
  selectedUnit,
  projectParking
}: {
  sellerForm: SellerForm;
  setSellerForm: SetSellerForm;
  suggestionUnits: UnitRow[];
  loadingUnits: boolean;
  selectedUnit: UnitRow | null;
  projectParking: ProjectParkingMeta | null;
}) {
  return (
    <div className="mt-6">
      <div className="text-xs font-semibold text-foreground">
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

      {selectedUnit ? (
        <CostSheet
          unit={selectedUnit}
          parkingRequired={sellerForm.parkingRequired}
          parkingCount={sellerForm.parkingCount}
          projectParking={projectParking}
        />
      ) : sellerForm.selectedUnitId ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Selected unit details are not in the current list. Refresh inventory
          or pick another unit.
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-[11px] text-muted-foreground">
          Pick a unit to see its cost sheet.
        </div>
      )}
    </div>
  );
}

function CostSheet({
  unit,
  parkingRequired,
  parkingCount,
  projectParking
}: {
  unit: UnitRow;
  parkingRequired: 'Yes' | 'No';
  parkingCount: string;
  projectParking: ProjectParkingMeta | null;
}) {
  const area = Number(unit.area) || 0;
  const rate = Number(unit.rate) || 0;
  const basicInr = area * rate;
  const lac = agreementValueLac(unit.area, unit.rate);
  const st = String(unit.status || '').toUpperCase();
  const statusLabel =
    STATUS_LABEL[unit.status] ??
    STATUS_LABEL[st] ??
    (st === 'AVAILABLE' ? 'Available' : unit.status);
  const slotRate =
    projectParking?.parking_rate != null && projectParking.parking_rate > 0
      ? projectParking.parking_rate
      : 0;
  const slotsAsked =
    parkingRequired === 'Yes' ? parkingCountNumeric(parkingCount) : 0;
  const parkingExtraInr =
    parkingRequired === 'Yes' && slotRate > 0 ? slotsAsked * slotRate : 0;
  const grandTotalInr = basicInr + parkingExtraInr;

  const rows: [string, string][] = [
    ['Floor', formatFloorLabel(unit.floor, unit.unit_type)],
    ['Configuration', unit.unit_type?.trim() || '—'],
    ['Status', statusLabel || '—'],
    ['Sale area', area > 0 ? `${area.toLocaleString('en-IN')} sq.ft` : '—'],
    [
      'Basic rate',
      rate > 0 ? `₹ ${rate.toLocaleString('en-IN')} / sq.ft` : '—'
    ],
    [
      'Agreement value (basic)',
      basicInr > 0
        ? `₹ ${lac.toFixed(2)} Lac (₹ ${basicInr.toLocaleString('en-IN')})`
        : '—'
    ],
    [
      'Parking availability (project)',
      formatProjectParkingSummary(projectParking)
    ]
  ];
  if (parkingRequired === 'Yes') {
    rows.push([
      'Parking (customer ask)',
      `Yes · ${parkingCount} slot${slotsAsked !== 1 ? 's' : ''}`
    ]);
    if (slotRate > 0) {
      rows.push([
        'Parking extra (est.)',
        parkingExtraInr > 0
          ? `₹ ${parkingExtraInr.toLocaleString('en-IN')} (${slotsAsked} × ₹ ${slotRate.toLocaleString('en-IN')})`
          : '—'
      ]);
    } else if (parkingRequired === 'Yes') {
      rows.push([
        'Parking extra (est.)',
        'Set project parking rate to estimate'
      ]);
    }
  }
  if (grandTotalInr > 0 && parkingRequired === 'Yes' && parkingExtraInr > 0) {
    rows.push([
      'Estimated total (basic + parking)',
      `₹ ${grandTotalInr.toLocaleString('en-IN')}`
    ]);
  }
  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Cost sheet
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground">
        {unit.unit_code}{' '}
        <span className="font-normal text-muted-foreground">
          · {unit.wing_name}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-3 rounded-md border border-border/80 bg-background px-3 py-2"
          >
            <dt className="text-[11px] font-semibold text-muted-foreground">
              {label}
            </dt>
            <dd className="text-right text-xs font-semibold text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        Basic cost is area × rate. Stamp duty, registration, GST, and other
        charges depend on project terms and local law — add them in the booking
        or agreement workflow.
      </p>
    </div>
  );
}

function StepReview({
  sellerForm,
  selectedUnit,
  brokers,
  projectParking
}: {
  sellerForm: SellerForm;
  selectedUnit: UnitRow | null;
  brokers: { id: string; full_name: string }[];
  projectParking: ProjectParkingMeta | null;
}) {
  const brokerLabel =
    sellerForm.leadSource === 'Broker' && sellerForm.brokerId
      ? brokers.find((b) => b.id === sellerForm.brokerId)?.full_name ?? '—'
      : '—';

  const customer: [string, string][] = [
    ['Name', sellerForm.customerName.trim() || '—'],
    [
      'Phone',
      normalizePhone(sellerForm.phone).length === 10
        ? sellerForm.phone
        : '—'
    ],
    ['Email', sellerForm.email.trim() || '—']
  ];
  const inquiry: [string, string][] = [
    ['Lead source', sellerForm.leadSource],
    ...(sellerForm.leadSource === 'Broker'
      ? ([['Broker', brokerLabel]] as [string, string][])
      : []),
    ['Interested in', sellerForm.interestedIn || 'Any'],
    [
      'Parking',
      sellerForm.parkingRequired === 'Yes'
        ? `Yes · count ${sellerForm.parkingCount}`
        : 'No'
    ],
    [
      'Parking availability (project)',
      formatProjectParkingSummary(projectParking)
    ],
    ['Notes', sellerForm.notes.trim() || '—']
  ];
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ReviewBlock title="Customer" rows={customer} />
      <ReviewBlock title="Inquiry" rows={inquiry} />
      <div className="lg:col-span-2">
        {selectedUnit ? (
          <CostSheet
            unit={selectedUnit}
            parkingRequired={sellerForm.parkingRequired}
            parkingCount={sellerForm.parkingCount}
            projectParking={projectParking}
          />
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            No unit selected. Go back to step 3 to pick a unit.
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewBlock({
  title,
  rows
}: {
  title: string;
  rows: [string, string][];
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 last:border-0 last:pb-0"
          >
            <dt className="text-[11px] font-semibold text-muted-foreground">
              {label}
            </dt>
            <dd className="text-right text-xs font-semibold text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

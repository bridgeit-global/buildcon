'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmailInputField } from '@/components/ui/email-input-field';
import { PhoneInputField } from '@/components/ui/phone-input-field';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  type ProjectParkingMeta,
  computeBookingCostBreakdown,
  formatProjectParkingSummary
} from '../booking-cost-utils';
import { formatUnitAgreementValueCompact } from '../inr-format';
import { writeBookingPrefill } from '../booking-prefill-storage';
import { isUnitSelectableForInquiry } from '../inventory/inventory-utils';
import {
  InquiryPipelineDialog,
  FUNNEL_STAGES,
  type OpportunityRow
} from './inquiry-pipeline-dialog';
import { InquiryPipelineBoard } from './inquiry-pipeline-board';

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
  carpet_area: number | null;
  bua_area: number | null;
  rate: number | null;
  floor_rise_charge: number | null;
  plc_charge: number | null;
  status: string;
};

function unitDisplayName(u: Pick<UnitRow, 'unit_code' | 'wing_name'>) {
  return `${u.unit_code} · ${u.wing_name}`;
}

const INQUIRY_INTEREST_ALL = '__inquiry_interest_all__';

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

function embedList<T>(x: T | T[] | null | undefined): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

const LEAD_SOURCE_COLOR: Record<string, string> = {
  Website: '#2563eb',
  'Social Media': '#ea580c',
  'Walk-in': '#38bdf8',
  Direct: '#64748b',
  Broker: '#9333ea',
  Referral: '#a855f7'
};

function leadSourceColor(label: string, index: number) {
  const trimmed = String(label || '').trim();
  if (LEAD_SOURCE_COLOR[trimmed]) return LEAD_SOURCE_COLOR[trimmed];
  const l = trimmed.toLowerCase();
  if (l.includes('whatsapp')) return '#16a34a';
  if (l.includes('facebook') || l.includes('instagram')) return '#ea580c';
  if (l.includes('website')) return '#2563eb';
  const palette = ['#7c3aed', '#0d9488', '#db2777', '#ca8a04', '#4f46e5'];
  return palette[index % palette.length];
}

function formatFollowDueLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const sod = (t: Date) =>
    new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const diffDays = Math.round((sod(d) - sod(new Date())) / 86400000);
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  });
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Tomorrow ${time}`;
  if (diffDays === -1) return `Yesterday ${time}`;
  return `${d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })} · ${time}`;
}

function funnelStageBadgeClass(stage: string) {
  const s = String(stage || '').trim();
  if (!s || s === 'Enquiry') {
    return 'border-red-200 bg-red-50 text-red-800';
  }
  if (s === 'Qualified') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  }
  if (s === 'Site Visit') {
    return 'border-green-200 bg-green-50 text-green-900';
  }
  if (s === 'Lost') return 'border-slate-200 bg-slate-100 text-slate-700';
  if (s === 'Won' || s === 'Booking') {
    return 'border-violet-200 bg-violet-50 text-violet-900';
  }
  return 'border-blue-200 bg-blue-50 text-blue-900';
}

function funnelStageLabel(stage: string) {
  const s = String(stage || '').trim();
  return s || 'New';
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
  sales_opportunities?: OpportunityRow | OpportunityRow[] | null;
};

function InquiryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  const [pipeline, setPipeline] = useState<{
    projectId: string;
    inquiryId: string;
  } | null>(null);
  const [stageMoveInquiryId, setStageMoveInquiryId] = useState<string | null>(
    null
  );

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
        profiles ( name ),
        sales_opportunities (
          id,
          funnel_stage,
          assigned_to,
          sales_follow_ups ( id, due_at, note, completed_at ),
          sales_site_visits ( id, scheduled_at, status, outcome )
        )
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

  const commitOpportunityStage = useCallback(
    async (
      inquiryId: string,
      newStage: (typeof FUNNEL_STAGES)[number]
    ) => {
      if (!activeProjectId) return;
      setStageMoveInquiryId(inquiryId);
      setError('');
      try {
        const inq = inquiries.find((i) => i.id === inquiryId);
        const opp = inq ? embedOne(inq.sales_opportunities) : null;
        if (opp) {
          const { error: uErr } = await supabase
            .from('sales_opportunities')
            .update({ funnel_stage: newStage })
            .eq('id', opp.id);
          if (uErr) throw uErr;
        } else {
          const { error: iErr } = await supabase
            .from('sales_opportunities')
            .insert({
              project_id: activeProjectId,
              sales_inquiry_id: inquiryId,
              funnel_stage: newStage,
              assigned_to: null
            });
          if (iErr) throw iErr;
        }
        await loadInquiries();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : 'Could not update pipeline stage'
        );
      } finally {
        setStageMoveInquiryId(null);
      }
    },
    [activeProjectId, inquiries, loadInquiries, supabase]
  );

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
    const q = searchParams.get('pipelineInquiry')?.trim();
    if (!q || !activeProjectId || loadingInquiries) return;
    const exists = inquiries.some((i) => i.id === q);
    if (exists) {
      setPipeline({ projectId: activeProjectId, inquiryId: q });
    }
  }, [searchParams, activeProjectId, inquiries, loadingInquiries]);

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
            'id,unit_code,wing_name,floor,unit_no,unit_type,area,carpet_area,bua_area,rate,floor_rise_charge,plc_charge,status,project_id'
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

  const pipelineOpportunity = useMemo(() => {
    if (!pipeline) return null;
    const inq = inquiries.find((i) => i.id === pipeline.inquiryId);
    return embedOne(inq?.sales_opportunities) ?? null;
  }, [pipeline, inquiries]);

  const kpiStats = useMemo(() => {
    const total = inquiries.length;
    const todayStr = new Date().toISOString().slice(0, 10);
    const createdToday = inquiries.filter(
      (i) => String(i?.created_at || '').slice(0, 10) === todayStr
    ).length;
    let newLeads = 0;
    let qualified = 0;
    let converted = 0;
    for (const inq of inquiries) {
      const opp = embedOne(inq.sales_opportunities);
      const s = String(opp?.funnel_stage || '').trim();
      if (!opp || s === 'Enquiry') newLeads++;
      else if (s === 'Qualified') qualified++;
      else if (s === 'Won' || s === 'Booking') converted++;
    }
    return { total, createdToday, newLeads, qualified, converted };
  }, [inquiries]);

  const leadSourceSlices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const inq of inquiries) {
      const src = String(inq.lead_source || 'Unknown').trim() || 'Unknown';
      counts.set(src, (counts.get(src) ?? 0) + 1);
    }
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, n]) => s + n, 0);
    return entries.map(([label, count], i) => ({
      label,
      count,
      color: leadSourceColor(label, i),
      pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0
    }));
  }, [inquiries]);

  const recentInquiriesPreview = useMemo(
    () => inquiries.slice(0, 6),
    [inquiries]
  );

  const upcomingFollowUps = useMemo(() => {
    type Row = {
      followId: string;
      inquiryId: string;
      dueAt: string;
      note: string | null;
      customerName: string;
    };
    const rows: Row[] = [];
    for (const inq of inquiries) {
      const opp = embedOne(inq.sales_opportunities);
      if (!opp) continue;
      const name = embedOne(inq.customers)?.full_name ?? '—';
      for (const f of embedList(opp.sales_follow_ups)) {
        if (f.completed_at) continue;
        rows.push({
          followId: f.id,
          inquiryId: inq.id,
          dueAt: f.due_at,
          note: f.note,
          customerName: name
        });
      }
    }
    rows.sort(
      (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    );
    return rows.slice(0, 10);
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
    return (units || []).filter((u) => isUnitSelectableForInquiry(u.status))
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

  const navigateToBookingFromInquiry = useCallback(
    (inq: InquiryRowDb) => {
      if (!activeProjectId || !String(inq.unit_id || '').trim()) return;
      writeBookingPrefill({
        projectId: activeProjectId,
        inquiryId: inq.id,
        inquiryRef: inquiryReference(inq.id),
        customerId: inq.customer_id,
        unitId: inq.unit_id,
        parkingRequired: inq.parking_required === 'Yes' ? 'Yes' : 'No',
        parkingCount: inq.parking_count,
        parkingSlotsAvailable: inq.parking_slots_available,
        parkingRateSnapshot: inq.parking_rate_snapshot
      });
      router.push('/crm/bookings');
    },
    [activeProjectId, router]
  );

  const continueToBookingFromReview = useCallback(async () => {
    if (!canSave || !projectId || !userLabel.id || !selectedUnit) return;
    setSaving(true);
    setError('');
    try {
      const customerId = await persistCustomerToDb();
      if (!customerId) return;
      writeBookingPrefill({
        projectId,
        inquiryId: null,
        inquiryRef: null,
        customerId,
        unitId: sellerForm.selectedUnitId,
        parkingRequired: sellerForm.parkingRequired,
        parkingCount: sellerForm.parkingCount,
        parkingSlotsAvailable: projectParking?.parking_slots ?? null,
        parkingRateSnapshot: projectParking?.parking_rate ?? null
      });
      router.push('/crm/bookings');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not continue to booking'
      );
    } finally {
      setSaving(false);
    }
  }, [
    canSave,
    projectId,
    userLabel.id,
    selectedUnit,
    persistCustomerToDb,
    sellerForm.selectedUnitId,
    sellerForm.parkingRequired,
    sellerForm.parkingCount,
    projectParking,
    router
  ]);

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

      const { data: inserted, error: inqErr } = await supabase
        .from('sales_inquiries')
        .insert({
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
        })
        .select('id')
        .single();

      if (inqErr) throw inqErr;
      if (!inserted?.id) throw new Error('Inquiry insert returned no id');

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

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Enquiries
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Capture leads, run pipeline, and convert to booking.
          </p>
        </div>
        <Button
          type="button"
          className="gap-1 bg-blue-600 hover:bg-blue-700"
          onClick={() =>
            document
              .getElementById('new-inquiry-form')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          + Add enquiry
        </Button>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(
            [
              ['Total enquiries', kpiStats.total, `${kpiStats.createdToday} today`],
              ['New', kpiStats.newLeads, 'Stage: Enquiry'],
              ['Qualified', kpiStats.qualified, 'In funnel'],
              ['Converted', kpiStats.converted, 'Booking or Won']
            ] as const
          ).map(([title, value, hint]) => (
            <div
              key={title}
              className="rounded-lg border border-border bg-muted/30 px-3 py-3"
            >
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {title}
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                {loadingInquiries ? '…' : value}
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="text-sm font-semibold text-foreground">
            Enquiry source
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Lead source for loaded enquiries (up to 500).
          </p>
          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <LeadSourceDonut slices={leadSourceSlices} />
            <ul className="w-full max-w-sm flex-1 space-y-2 text-sm">
              {leadSourceSlices.length === 0 ? (
                <li className="text-xs text-muted-foreground">
                  {loadingInquiries
                    ? 'Loading…'
                    : 'No enquiries yet for this project.'}
                </li>
              ) : (
                leadSourceSlices.map((s) => (
                  <li
                    key={s.label}
                    className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0 last:pb-0"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                        aria-hidden
                      />
                      <span className="truncate font-medium text-foreground">
                        {s.label}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                      {s.pct}% · {s.count}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold text-foreground">
            Recent enquiries
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Latest by created date.
          </p>
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {recentInquiriesPreview.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                {loadingInquiries
                  ? 'Loading…'
                  : 'No enquiries yet for this project.'}
              </li>
            ) : (
              recentInquiriesPreview.map((inq) => {
                const c = embedOne(inq.customers);
                const stage =
                  embedOne(inq.sales_opportunities)?.funnel_stage ?? '';
                const label = funnelStageLabel(stage);
                return (
                  <li
                    key={inq.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {c?.full_name ?? '—'}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {c?.phone ?? '—'}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        funnelStageBadgeClass(stage)
                      )}
                    >
                      {label}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </Card>
      </div>

      {/* <Card className="p-4" id="inquiry-pipeline-board">
        <InquiryPipelineBoard
          inquiries={filtered}
          loading={loadingInquiries}
          pendingInquiryId={stageMoveInquiryId}
          onStageChange={(id, stage) => void commitOpportunityStage(id, stage)}
          onOpenPipeline={(inquiryId) =>
            setPipeline({
              projectId: activeProjectId ?? '',
              inquiryId
            })
          }
        />
      </Card> */}

      <Card className="p-4">
        <div className="text-sm font-semibold text-foreground">Follow-ups</div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Open follow-ups with due times (soonest first).
        </p>
        <ul className="mt-3 space-y-2">
          {upcomingFollowUps.length === 0 ? (
            <li className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              {loadingInquiries
                ? 'Loading…'
                : 'No open follow-ups. Add one from Pipeline on an enquiry.'}
            </li>
          ) : (
            upcomingFollowUps.map((row) => {
              const summary = String(row.note || '').trim() || 'Follow-up';
              return (
                <li key={row.followId}>
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40"
                    onClick={() =>
                      setPipeline({
                        projectId: activeProjectId ?? '',
                        inquiryId: row.inquiryId
                      })
                    }
                  >
                    <span className="font-semibold text-foreground">
                      {row.customerName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {summary} — {formatFollowDueLabel(row.dueAt)}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </Card>

      <Card className="p-4" id="new-inquiry-form">
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
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canSave || saving || !userLabel.id}
                  onClick={() => void saveInquiry()}
                >
                  {saving ? 'Saving…' : 'Save inquiry only'}
                </Button>
                <Button
                  type="button"
                  disabled={!canSave || saving || !userLabel.id}
                  onClick={() => void continueToBookingFromReview()}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                >
                  Confirm booking
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-4" id="inquiry-list">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">
              Inquiry list
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Stored in the database with linked customer and unit.{' '}
              <span className="tabular-nums text-foreground">
                {loadingInquiries ? 'Loading…' : `${inquiries.length} loaded`}
              </span>
            </div>
          </div>
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

        <Label className="sr-only">Search inquiries</Label>
        <Input
          className="mt-4"
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
                  'Stage',
                  'Parking',
                  'Seller',
                  'Actions'
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
                    colSpan={12}
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
                      <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">
                        {embedOne(inq.sales_opportunities)?.funnel_stage ?? '—'}
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
                      <td className="whitespace-nowrap px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() =>
                              setPipeline({
                                projectId: activeProjectId ?? '',
                                inquiryId: inq.id
                              })
                            }
                          >
                            Pipeline
                          </Button>
                          {inq.unit_id?.trim() ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-8 gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                              onClick={() => navigateToBookingFromInquiry(inq)}
                            >
                              Booking
                              <ArrowRight className="size-3.5 opacity-90" />
                            </Button>
                          ) : (
                            <span className="self-center text-[10px] text-muted-foreground">
                              No unit
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <InquiryPipelineDialog
        open={pipeline != null}
        onOpenChange={(o) => {
          if (!o) {
            setPipeline(null);
            if (searchParams.get('pipelineInquiry')) {
              router.replace('/crm/inquiry', { scroll: false });
            }
          }
        }}
        projectId={pipeline?.projectId ?? ''}
        opportunity={pipelineOpportunity}
        onSaved={() => {
          void loadInquiries();
        }}
      />
    </div>
  );
}

function LeadSourceDonut({
  slices
}: {
  slices: { label: string; count: number; color: string }[];
}) {
  const total = slices.reduce((s, x) => s + x.count, 0);
  if (total <= 0) {
    return (
      <div
        className="flex size-44 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-center text-[11px] leading-snug text-muted-foreground"
        aria-hidden
      >
        No source data
      </div>
    );
  }
  let accPct = 0;
  const gradientParts: string[] = [];
  for (const sl of slices) {
    const pct = (sl.count / total) * 100;
    const start = accPct;
    accPct += pct;
    gradientParts.push(`${sl.color} ${start}% ${accPct}%`);
  }
  return (
    <div className="relative mx-auto size-44 shrink-0 sm:mx-0">
      <div
        className="size-44 rounded-full shadow-inner ring-1 ring-black/5 dark:ring-white/10"
        style={{ background: `conic-gradient(${gradientParts.join(', ')})` }}
      />
      <div className="absolute inset-[26%] flex flex-col items-center justify-center rounded-full bg-card text-center shadow-sm ring-1 ring-border">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          Sources
        </span>
        <span className="text-lg font-bold tabular-nums leading-none text-foreground">
          {total}
        </span>
      </div>
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
        <PhoneInputField
          value={sellerForm.phone}
          onChange={(v) => setSellerForm((s) => ({ ...s, phone: v }))}
          label="Phone *"
          placeholder="10-digit mobile"
          mode="digits10"
        />
        <EmailInputField
          value={sellerForm.email}
          onChange={(v) => setSellerForm((s) => ({ ...s, email: v }))}
          placeholder="Email"
        />
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
        <Select
          value={sellerForm.leadSource}
          onValueChange={(v) => {
            const nv = v as (typeof LEAD_SOURCES)[number];
            setSellerForm((s) => ({
              ...s,
              leadSource: nv,
              brokerId: nv === 'Broker' ? s.brokerId : ''
            }));
          }}
        >
          <SelectTrigger className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEAD_SOURCES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Broker</Label>
        <Select
          value={
            sellerForm.brokerId === ''
              ? undefined
              : sellerForm.brokerId
          }
          onValueChange={(v) =>
            setSellerForm((s) => ({ ...s, brokerId: v }))
          }
          disabled={sellerForm.leadSource !== 'Broker'}
        >
          <SelectTrigger
            className={cn(
              'mt-1 w-full',
              sellerForm.leadSource !== 'Broker' && 'opacity-60'
            )}
          >
            <SelectValue placeholder="Select broker…" />
          </SelectTrigger>
          <SelectContent>
            {brokers.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sellerForm.leadSource === 'Broker' && brokers.length === 0 ? (
          <p className="mt-1 text-[10px] text-muted-foreground">
            No active brokers. Add one under CRM → Brokers.
          </p>
        ) : null}
      </div>
      <div>
        <Label>Interested in</Label>
        <Select
          value={
            sellerForm.interestedIn === ''
              ? INQUIRY_INTEREST_ALL
              : sellerForm.interestedIn
          }
          onValueChange={(v) =>
            setSellerForm((s) => ({
              ...s,
              interestedIn: v === INQUIRY_INTEREST_ALL ? '' : v
            }))
          }
        >
          <SelectTrigger className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={INQUIRY_INTEREST_ALL}>All types</SelectItem>
            {INTEREST_TYPES.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Parking</Label>
        <Select
          value={sellerForm.parkingRequired}
          onValueChange={(v) =>
            setSellerForm((s) => ({
              ...s,
              parkingRequired: v as 'Yes' | 'No'
            }))
          }
        >
          <SelectTrigger className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="No">No parking required</SelectItem>
            <SelectItem value="Yes">Parking required</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Parking count</Label>
        <Select
          value={sellerForm.parkingCount}
          onValueChange={(v) =>
            setSellerForm((s) => ({ ...s, parkingCount: v }))
          }
          disabled={sellerForm.parkingRequired !== 'Yes'}
        >
          <SelectTrigger
            className={cn(
              'mt-1 w-full',
              sellerForm.parkingRequired !== 'Yes' && 'opacity-60'
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['1', '2', '3', '4+'] as const).map((x) => (
              <SelectItem key={x} value={x}>
                Parking count: {x}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2 xl:col-span-4">
        <Label>Notes</Label>
        <Textarea
          value={sellerForm.notes}
          onChange={(e) =>
            setSellerForm((s) => ({ ...s, notes: e.target.value }))
          }
          rows={2}
          placeholder="Notes"
          className="mt-1 min-h-[60px]"
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
                  {formatUnitAgreementValueCompact(u)}
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
  const slotRate =
    projectParking?.parking_rate != null && projectParking.parking_rate > 0
      ? projectParking.parking_rate
      : 0;
  const { rows } = computeBookingCostBreakdown(
    unit,
    parkingRequired,
    parkingCount,
    slotRate,
    projectParking
  );
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
        Dwelling line uses billable carpet/BUA when set, plus floor-rise and PLC
        lump sums. Extra parking beyond what is bundled with the unit is
        estimated from the project rate. Stamp duty, registration, GST, and
        other charges depend on project terms and local law.
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

export default function InquiryPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-muted-foreground">
          Loading inquiries…
        </div>
      }
    >
      <InquiryPageContent />
    </Suspense>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useCrmProjectsContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  computeBookingCostBreakdown,
  type ProjectParkingMeta,
  type ProjectPricingMeta
} from '../booking-cost-utils';

type QRow = {
  id: string;
  created_at: string;
  status: string;
  customer_id: string;
  unit_id: string | null;
  grand_total: number;
  customers: { full_name: string } | { full_name: string }[] | null;
  projects: { name: string } | { name: string }[] | null;
};

type UnitPick = {
  id: string;
  project_id: string;
  unit_code: string;
  wing_name: string;
  floor: number;
  unit_type: string | null;
  area: number | null;
  carpet_area: number | null;
  bua_area: number | null;
  rate: number | null;
  floor_rise_charge: number | null;
  plc_charge: number | null;
  parking_slots_included: number | null;
  status: string;
};

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export default function QuotationsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { projects } = useCrmProjectsContext();
  const [rows, setRows] = useState<QRow[]>([]);
  const [customers, setCustomers] = useState<{ id: string; full_name: string }[]>(
    []
  );
  const [units, setUnits] = useState<UnitPick[]>([]);
  const [pricing, setPricing] = useState<ProjectPricingMeta | null>(null);
  const [parking, setParking] = useState<ProjectParkingMeta | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadProjectPricing = useCallback(
    async (projectId: string) => {
      const { data, error } = await supabase
        .from('projects')
        .select(
          'parking_slots,parking_rate,pricing_gst_registered,pricing_gst_percent,pricing_stamp_duty_percent,pricing_registration_fee'
        )
        .eq('id', projectId)
        .maybeSingle();
      if (error) {
        setError(error.message);
        return;
      }
      const pd = data as Record<string, unknown> | null;
      if (pd) {
        setParking({
          parking_slots: (pd.parking_slots as number | null) ?? null,
          parking_rate: (pd.parking_rate as number | null) ?? null
        });
        setPricing({
          gst_registered: Boolean(pd.pricing_gst_registered),
          gst_percent: Number(pd.pricing_gst_percent) || 0,
          stamp_duty_percent: Number(pd.pricing_stamp_duty_percent) || 0,
          registration_fee: Number(pd.pricing_registration_fee) || 0
        });
      } else {
        setParking(null);
        setPricing(null);
      }
    },
    [supabase]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [qRes, cRes, uRes] = await Promise.all([
      supabase
        .from('quotations')
        .select(
          `
          id,created_at,status,customer_id,unit_id,grand_total,
          customers ( full_name ),
          projects ( name )
        `
        )
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('customers')
        .select('id,full_name')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('units')
        .select(
          'id,project_id,unit_code,wing_name,floor,unit_type,area,carpet_area,bua_area,rate,floor_rise_charge,plc_charge,parking_slots_included,status,projects(name)'
        )
        .order('unit_code', { ascending: true })
        .limit(2000)
    ]);
    if (qRes.error) setError(qRes.error.message);
    if (cRes.error) setError(cRes.error.message);
    if (uRes.error) setError(uRes.error.message);
    setRows((qRes.data ?? []) as QRow[]);
    setCustomers((cRes.data ?? []) as { id: string; full_name: string }[]);
    setUnits((uRes.data ?? []) as UnitPick[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const u = units.find((x) => x.id === unitId);
    if (!u?.project_id) {
      setParking(null);
      setPricing(null);
      return;
    }
    void loadProjectPricing(u.project_id);
  }, [unitId, units, loadProjectPricing]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createDraft() {
    const u = units.find((x) => x.id === unitId);
    if (!u?.project_id || !customerId || !unitId) return;
    setSaving(true);
    setError('');
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!u) throw new Error('Unit not found');
      const br = computeBookingCostBreakdown(
        {
          unit_code: u.unit_code,
          wing_name: u.wing_name,
          floor: u.floor,
          unit_type: u.unit_type,
          area: u.area,
          rate: u.rate,
          status: u.status
        },
        'No',
        '1',
        null,
        parking ?? undefined,
        pricing ?? undefined
      );
      const extras = Math.max(0, br.grandTotalInr - br.basicInr - br.parkingExtraInr);
      const { error: insErr } = await supabase.from('quotations').insert({
        project_id: u.project_id,
        customer_id: customerId,
        unit_id: unitId,
        status: 'draft',
        agreement_value_basic: br.basicInr,
        parking_amount: br.parkingExtraInr,
        gst_amount: extras,
        stamp_duty_estimate: 0,
        registration_estimate: 0,
        discount_amount: 0,
        grand_total: br.grandTotalInr,
        notes: 'Draft from CRM quotations',
        payload: { rows: br.rows },
        created_by: user?.id ?? null
      });
      if (insErr) throw insErr;
      setUnitId('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create quotation');
    } finally {
      setSaving(false);
    }
  }

  const projectNameById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  function projectLabel(p: QRow['projects']) {
    if (!p) return '—';
    const row = embedOne(p);
    return row?.name ?? '—';
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card className="p-4">
        <div className="text-sm font-semibold">New quotation (draft)</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Uses project pricing defaults and unit rate; GST and stamp lines follow
          the same rules as the booking cost sheet.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label className="text-xs">Customer</Label>
            <Select value={customerId || undefined} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Unit</Label>
            <Select value={unitId || undefined} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {projectNameById.get(u.project_id) ?? '—'} · {u.unit_code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          className="mt-3"
          type="button"
          disabled={saving || !customerId || !unitId}
          onClick={() => void createDraft()}
        >
          {saving ? 'Saving…' : 'Create draft'}
        </Button>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Recent quotations</div>
          <Button variant="outline" size="sm" type="button" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-2">Created</th>
                <th className="py-2 pr-2">Project</th>
                <th className="py-2 pr-2">Customer</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2 pr-2 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="max-w-[120px] truncate py-2 pr-2 text-xs text-muted-foreground">
                    {projectLabel(r.projects)}
                  </td>
                  <td className="py-2 pr-2">
                    {embedOne(r.customers)?.full_name ?? r.customer_id}
                  </td>
                  <td className="py-2 pr-2">{r.status}</td>
                  <td className="py-2 font-medium tabular-nums">
                    ₹ {Number(r.grand_total).toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-muted-foreground">
                    {loading ? 'Loading…' : 'No quotations yet.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

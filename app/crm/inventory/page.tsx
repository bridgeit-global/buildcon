'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  formatAgreementValueCompact,
  formatInrCompactLacCr
} from '../inr-format';
import {
  STATUS_COLOR,
  STATUS_LABEL,
  formatFloorChipLabel,
  formatFloorLabel
} from './inventory-utils';

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
  blocked_reason: string | null;
  blocked_on: string | null;
};

type ProjectRow = {
  name: string;
  location: string | null;
  rera_no: string | null;
  floors_per_wing: number;
  units_per_floor: number;
  parking_slots: number | null;
  parking_rate: number | null;
};

type BookingPreview = {
  id: string;
  created_at: string;
  booking_amount: number | null;
  payment_mode: string | null;
  customers: { full_name: string; phone: string | null } | null;
};

const BLOCK_REASONS = [
  'Legal hold',
  'Management reserve',
  'Bank hold',
  'Rehab pipeline',
  'Other'
];

const TABS = [
  'Inventory Info',
  'Grid View',
  'Unit List',
  'Floor Plan',
  'Map 3D',
  'Blocked Units'
] as const;

type InventoryTab = (typeof TABS)[number];

function tabCardClass() {
  return 'rounded-lg border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]';
}

function StatusBadge({
  code,
  className
}: {
  code: string;
  className?: string;
}) {
  const bg = STATUS_COLOR[code] ?? '#94A3B8';
  const label = STATUS_LABEL[code] ?? code;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold',
        className
      )}
      style={{
        background: `${bg}22`,
        color: bg,
        borderColor: `${bg}44`
      }}
    >
      {label}
    </span>
  );
}

function UnitDetailDialog({
  unit,
  projectId,
  projectName,
  open,
  onOpenChange,
  onCreateBooking
}: {
  unit: UnitRow | null;
  projectId: string | null;
  projectName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreateBooking: () => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [booking, setBooking] = useState<BookingPreview | null>(null);

  useEffect(() => {
    if (!open || !unit || !projectId) {
      setBooking(null);
      return;
    }
    if (unit.status !== 'B' && unit.status !== 'S') {
      setBooking(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          'id, created_at, booking_amount, payment_mode, customers ( full_name, phone )'
        )
        .eq('project_id', projectId)
        .eq('unit_id', unit.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setBooking(null);
        return;
      }
      const row = data as {
        id: string;
        created_at: string;
        booking_amount: number | null;
        payment_mode: string | null;
        customers:
        | { full_name: string; phone: string | null }
        | { full_name: string; phone: string | null }[]
        | null;
      };
      const cust = Array.isArray(row.customers)
        ? row.customers[0] ?? null
        : row.customers;
      setBooking({
        id: row.id,
        created_at: row.created_at,
        booking_amount: row.booking_amount,
        payment_mode: row.payment_mode,
        customers: cust
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, unit, projectId, supabase]);

  if (!unit) return null;

  const area = Number(unit.area) || 0;
  const rate = Number(unit.rate) || 0;
  const bookedOn = booking?.created_at
    ? new Date(booking.created_at).toLocaleDateString('en-IN')
    : '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden gap-0 p-0 sm:max-w-[520px] [&>button]:hidden">
        <div className="flex flex-col border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-[18px] py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle
                id="unit-detail-title"
                className="text-lg font-bold tracking-tight text-slate-900"
              >
                {unit.unit_code}
              </DialogTitle>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                {unit.wing_name} · {unit.unit_type ?? '—'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge code={unit.status} className="text-[10px] px-2.5" />
              <button
                type="button"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-slate-100 text-lg leading-none text-slate-500 hover:bg-slate-200"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <div className="max-h-[min(60vh,520px)] flex-1 overflow-y-auto px-[18px] py-4">
          <div className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Unit summary
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2.5">
            {(
              [
                ['Wing / tower', unit.wing_name],
                ['Floor', formatFloorLabel(unit.floor, unit.unit_type)],
                [
                  'Position on floor',
                  unit.unit_no != null ? `Unit slot ${unit.unit_no}` : '—'
                ],
                ['Configuration', unit.unit_type ?? '—'],
                ['Carpet / sale area', `${area} sq.ft`],
                ['Rate', `₹ ${rate.toLocaleString('en-IN')} / sq.ft`],
                ['Agreement value', formatAgreementValueCompact(unit.area, unit.rate)],
                ['Project', projectName || projectId || '—']
              ] as const
            ).map(([label, val]) => (
              <div
                key={label}
                className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"
              >
                <div className="mb-1 text-[10px] font-semibold text-slate-400">
                  {label}
                </div>
                <div className="text-xs font-semibold text-slate-800">{val}</div>
              </div>
            ))}
          </div>

          {unit.status === 'BL' && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3">
              <div className="mb-2 text-[10px] font-bold uppercase text-amber-800">
                Blocked
              </div>
              <div className="text-xs leading-relaxed text-amber-950">
                <div>
                  <strong>Reason:</strong> {unit.blocked_reason ?? '—'}
                </div>
              </div>
            </div>
          )}

          {booking && (unit.status === 'B' || unit.status === 'S') && (
            <div
              className={cn(
                'mb-4 rounded-lg border px-3 py-3',
                unit.status === 'S'
                  ? 'border-violet-300 bg-violet-50'
                  : 'border-blue-200 bg-blue-50'
              )}
            >
              <div
                className={cn(
                  'mb-2 text-[10px] font-bold uppercase',
                  unit.status === 'S' ? 'text-violet-800' : 'text-blue-800'
                )}
              >
                {unit.status === 'S' ? 'Sale completed' : 'Active booking'}
              </div>
              <div
                className={cn(
                  'grid grid-cols-2 gap-2 text-[11px]',
                  unit.status === 'S' ? 'text-violet-950' : 'text-blue-950'
                )}
              >
                <div>
                  <span className="text-slate-500">Booking ID</span>
                  <br />
                  <strong className="break-all">{booking.id}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Booked on</span>
                  <br />
                  <strong>{bookedOn}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Customer</span>
                  <br />
                  <strong>{booking.customers?.full_name ?? '—'}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Phone</span>
                  <br />
                  <strong>{booking.customers?.phone ?? '—'}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Booking token</span>
                  <br />
                  <strong>
                    {booking?.booking_amount != null
                      ? formatInrCompactLacCr(Number(booking.booking_amount))
                      : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Payment</span>
                  <br />
                  <strong>{booking.payment_mode ?? '—'}</strong>
                </div>
              </div>
            </div>
          )}

          <p className="text-[11px] italic text-slate-400">
            Room-level breakdown is not stored for units in this build.
          </p>
        </div>

        <DialogFooter className="gap-2 border-t border-slate-200 bg-slate-50 px-[18px] py-3 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {unit.status === 'A' ? (
            <Button
              onClick={() => {
                onOpenChange(false);
                onCreateBooking();
              }}
            >
              Create booking
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnitEditDialog({
  unit,
  open,
  onOpenChange,
  onSaved
}: {
  unit: UnitRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    unit_code: '',
    unit_type: '',
    area: 0,
    rate: 0,
    floor: 1,
    unit_no: 1,
    status: 'A',
    blocked_reason: ''
  });

  useEffect(() => {
    if (!unit || !open) return;
    setForm({
      unit_code: unit.unit_code,
      unit_type: unit.unit_type ?? '',
      area: Number(unit.area) || 0,
      rate: Number(unit.rate) || 0,
      floor: Number(unit.floor) || 1,
      unit_no: Number(unit.unit_no) || 1,
      status: unit.status,
      blocked_reason: unit.blocked_reason ?? ''
    });
  }, [unit, open]);

  async function save() {
    if (!unit) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      unit_code: form.unit_code.trim() || unit.unit_code,
      unit_type: form.unit_type || null,
      area: Math.max(1, Number(form.area) || 1),
      rate: Math.max(1, Number(form.rate) || 1),
      floor: Number(form.floor) || 1,
      unit_no: Math.max(1, Number(form.unit_no) || 1),
      status: form.status
    };
    if (form.status === 'BL') {
      payload.blocked_reason = form.blocked_reason || 'Other';
      payload.blocked_on = new Date().toISOString().slice(0, 10);
    } else {
      payload.blocked_reason = null;
      payload.blocked_on = null;
    }
    const { error } = await supabase.from('units').update(payload).eq('id', unit.id);
    setSaving(false);
    if (!error) {
      onSaved();
      onOpenChange(false);
    }
  }

  if (!unit) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[520px]">
        <DialogHeader className="border-b border-slate-200 px-4 py-3.5">
          <DialogTitle className="text-sm font-bold text-slate-800">
            Edit Unit Details
          </DialogTitle>
          <p className="text-[11px] text-slate-500">{unit.unit_code}</p>
        </DialogHeader>
        <div className="grid max-h-[55vh] grid-cols-2 gap-2.5 overflow-y-auto p-4">
          <div className="col-span-2 flex flex-col gap-1">
            <Label className="text-[10px] text-slate-500">Unit code</Label>
            <Input
              value={form.unit_code}
              onChange={(e) =>
                setForm((f) => ({ ...f, unit_code: e.target.value }))
              }
              className="h-9 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-slate-500">Type</Label>
            <Input
              value={form.unit_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, unit_type: e.target.value }))
              }
              className="h-9 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-slate-500">Status</Label>
            <select
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value }))
              }
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
            >
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-slate-500">Area (sq.ft)</Label>
            <Input
              type="number"
              min={1}
              value={form.area}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  area: Number(e.target.value) || 0
                }))
              }
              className="h-9 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-slate-500">Rate (₹/sq.ft)</Label>
            <Input
              type="number"
              min={1}
              value={form.rate}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  rate: Number(e.target.value) || 0
                }))
              }
              className="h-9 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-slate-500">Floor</Label>
            <Input
              type="number"
              value={form.floor}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  floor: Number(e.target.value) || 0
                }))
              }
              className="h-9 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-slate-500">Unit slot</Label>
            <Input
              type="number"
              min={1}
              value={form.unit_no}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  unit_no: Number(e.target.value) || 1
                }))
              }
              className="h-9 text-xs"
            />
          </div>
          {form.status === 'BL' ? (
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-[10px] text-slate-500">
                Blocked reason
              </Label>
              <Input
                value={form.blocked_reason}
                onChange={(e) =>
                  setForm((f) => ({ ...f, blocked_reason: e.target.value }))
                }
                placeholder="Reason for blocking"
                className="h-9 text-xs"
              />
            </div>
          ) : null}
        </div>
        <DialogFooter className="border-t border-slate-200 bg-slate-50 px-4 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnitCell({
  unit,
  onClick
}: {
  unit: UnitRow;
  onClick: (u: UnitRow) => void;
}) {
  const bg = STATUS_COLOR[unit.status] ?? '#94A3B8';
  return (
    <button
      type="button"
      title={`${unit.unit_code} | ${unit.unit_type ?? ''} | ${unit.area ?? ''} sq.ft`}
      onClick={() => onClick(unit)}
      className="inline-flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-[5px] text-[9px] font-bold text-white shadow-sm transition-transform hover:scale-105"
      style={{
        background: bg,
        boxShadow: '0 1px 2px rgba(0,0,0,0.15)'
      }}
    >
      {unit.status}
    </button>
  );
}

export default function InventoryPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const { activeProjectId } = useActiveProjectContext();

  const [tab, setTab] = useState<InventoryTab>('Inventory Info');
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [wingNames, setWingNames] = useState<string[]>([]);
  const [unitTypeNames, setUnitTypeNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [structFilter, setStructFilter] = useState('All');
  const [floorFilter, setFloorFilter] = useState('all');

  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState<'All' | keyof typeof STATUS_LABEL>('All');
  const [typeF, setTypeF] = useState('All');
  const [structListF, setStructListF] = useState('All');

  const [selected, setSelected] = useState<UnitRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editUnit, setEditUnit] = useState<UnitRow | null>(null);

  const [blockUnitId, setBlockUnitId] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [blocking, setBlocking] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState(false);

  const [floorPlanWing, setFloorPlanWing] = useState<string>('');
  const [floorPlanFloor, setFloorPlanFloor] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!activeProjectId) return;
    setLoading(true);
    setError('');
    const [unitsRes, projRes, wingsRes, typesRes] = await Promise.all([
      supabase
        .from('units')
        .select(
          'id,unit_code,wing_name,floor,unit_no,unit_type,area,rate,status,blocked_reason,blocked_on'
        )
        .eq('project_id', activeProjectId)
        .order('wing_name', { ascending: true })
        .order('floor', { ascending: false })
        .order('unit_no', { ascending: true }),
      supabase
        .from('projects')
        .select(
          'name, location, rera_no, floors_per_wing, units_per_floor, parking_slots, parking_rate'
        )
        .eq('id', activeProjectId)
        .maybeSingle(),
      supabase
        .from('project_wings')
        .select('name')
        .eq('project_id', activeProjectId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('project_unit_types')
        .select('name')
        .eq('project_id', activeProjectId)
        .order('sort_order', { ascending: true })
    ]);

    if (unitsRes.error) setError(unitsRes.error.message);
    setUnits((unitsRes.data ?? []) as UnitRow[]);

    if (projRes.data) setProject(projRes.data as ProjectRow);

    const wingList =
      wingsRes.data?.map((w: { name: string }) => w.name) ?? [];
    setWingNames(wingList);

    const typeList =
      typesRes.data?.map((t: { name: string }) => t.name) ?? [];
    setUnitTypeNames(typeList);

    setLoading(false);
  }, [activeProjectId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('buildcon_inventory_open_tab');
      if (raw && TABS.includes(raw as InventoryTab)) {
        setTab(raw as InventoryTab);
        sessionStorage.removeItem('buildcon_inventory_open_tab');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const projectName = project?.name ?? '';

  const structureOptions = useMemo(() => {
    const fromUnits = [...new Set(units.map((u) => u.wing_name))].sort();
    if (wingNames.length) return wingNames;
    return fromUnits;
  }, [units, wingNames]);

  const typeOptions = useMemo(() => {
    const fromUnits = [...new Set(units.map((u) => u.unit_type).filter(Boolean))] as string[];
    const merged = [...new Set([...unitTypeNames, ...fromUnits])];
    return merged.sort();
  }, [units, unitTypeNames]);

  const floorValues = useMemo(() => {
    return [
      ...new Set(units.map((u) => Number(u.floor)).filter((f) => Number.isFinite(f)))
    ].sort((a, b) => b - a);
  }, [units]);

  const floorOptions = useMemo(
    () => [
      { value: 'all', label: 'All Floors' },
      ...floorValues.map((f) => ({
        value: String(f),
        label: formatFloorLabel(f, undefined)
      }))
    ],
    [floorValues]
  );

  const filteredGrid = useMemo(() => {
    return units.filter((u) => {
      if (structFilter !== 'All' && u.wing_name !== structFilter)
        return false;
      if (
        floorFilter !== 'all' &&
        floorFilter !== 'All Floors' &&
        Number(u.floor) !== Number(floorFilter)
      )
        return false;
      return true;
    });
  }, [units, structFilter, floorFilter]);

  const filteredList = useMemo(() => {
    const q = search.toLowerCase();
    return units.filter((u) => {
      if (statusF !== 'All' && u.status !== statusF) return false;
      if (typeF !== 'All' && u.unit_type !== typeF) return false;
      if (structListF !== 'All' && u.wing_name !== structListF)
        return false;
      if (
        q &&
        !u.unit_code.toLowerCase().includes(q) &&
        !u.wing_name.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [units, search, statusF, typeF, structListF]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    Object.keys(STATUS_LABEL).forEach((k) => {
      c[k] = 0;
    });
    units.forEach((u) => {
      if (c[u.status] !== undefined) c[u.status]++;
    });
    return c;
  }, [units]);

  const uniqueWingsGrid = useMemo(
    () => [...new Set(filteredGrid.map((u) => u.wing_name))].sort(),
    [filteredGrid]
  );

  const unitsByWingFloor = useMemo(() => {
    const map: Record<string, UnitRow[]> = {};
    filteredGrid.forEach((u) => {
      const key = `${u.wing_name}||${u.floor}`;
      if (!map[key]) map[key] = [];
      map[key].push(u);
    });
    return map;
  }, [filteredGrid]);

  const blockedUnits = useMemo(
    () => units.filter((u) => u.status === 'BL'),
    [units]
  );

  const leafFloorPlan =
    structureOptions.length > 0 ? structureOptions : uniqueWingsGrid;
  const effectiveFloorPlanWing =
    floorPlanWing || leafFloorPlan[0] || '';

  const wingUnitsFp = useMemo(
    () => units.filter((u) => u.wing_name === effectiveFloorPlanWing),
    [units, effectiveFloorPlanWing]
  );

  const floorsFp = useMemo(
    () =>
      [...new Set(wingUnitsFp.map((u) => u.floor))]
        .filter((f) => Number.isFinite(Number(f)))
        .sort((a, b) => Number(b) - Number(a)),
    [wingUnitsFp]
  );

  const displayFloorFp =
    floorPlanFloor ?? floorsFp[0] ?? null;

  const floorUnitsFp = useMemo(
    () =>
      wingUnitsFp.filter((u) => u.floor === displayFloorFp),
    [wingUnitsFp, displayFloorFp]
  );

  useEffect(() => {
    if (!floorPlanWing && leafFloorPlan[0]) {
      setFloorPlanWing(leafFloorPlan[0]);
    }
  }, [floorPlanWing, leafFloorPlan]);

  useEffect(() => {
    setFloorPlanFloor(null);
  }, [effectiveFloorPlanWing]);

  async function blockSelected() {
    if (!blockUnitId || !blockReason) return;
    setBlocking(true);
    setError('');
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from('units')
      .update({
        status: 'BL',
        blocked_reason: blockReason,
        blocked_on: today
      })
      .eq('id', blockUnitId)
      .eq('status', 'A');

    if (error) setError(error.message);
    setBlockUnitId('');
    setBlockReason('');
    setShowBlockForm(false);
    await load();
    setBlocking(false);
  }

  async function unblock(unitId: string) {
    setError('');
    const { error } = await supabase
      .from('units')
      .update({
        status: 'A',
        blocked_reason: null,
        blocked_on: null
      })
      .eq('id', unitId)
      .eq('status', 'BL');
    if (error) setError(error.message);
    await load();
  }

  function openDetail(u: UnitRow) {
    setSelected(u);
    setDetailOpen(true);
  }

  if (!activeProjectId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Select a project to view inventory.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          'flex flex-wrap gap-0 rounded-lg px-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]',
          tabCardClass()
        )}
      >
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'cursor-pointer whitespace-nowrap border-b-2 border-transparent px-3.5 py-3 text-[11px]',
              tab === t
                ? 'border-b-2 border-blue-500 font-semibold text-blue-500'
                : 'font-normal text-slate-500 hover:text-slate-700'
            )}
            style={
              tab === t
                ? { borderBottomColor: '#3B82F6', color: '#3B82F6' }
                : undefined
            }
          >
            {t}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {tab === 'Inventory Info' && (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-[11px] text-blue-600">
            <span aria-hidden>ℹ️</span>
            <span>
              Inventory configuration is set during{' '}
              <strong>Project Creation</strong>. To change wings, floors, or
              density,{' '}
              <Link
                href="/crm/project"
                className="font-bold text-blue-800 underline"
              >
                edit the project
              </Link>
              .
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <div className={cn('p-4', tabCardClass())}>
              <div className="mb-3 text-[11px] font-semibold text-slate-800">
                Project Configuration
              </div>
              {project ? (
                <>
                  {(
                    [
                      ['Project', project.name],
                      ['Location', project.location ?? '—'],
                      ['RERA No.', project.rera_no ?? '—'],
                      [
                        'Structure leaves',
                        structureOptions.length
                          ? structureOptions.join(', ')
                          : '—'
                      ],
                      ['Floors (default)', project.floors_per_wing ?? '—'],
                      ['Units / floor (def.)', project.units_per_floor ?? '—'],
                      [
                        'Parking slots',
                        project.parking_slots != null &&
                        project.parking_slots > 0
                          ? String(project.parking_slots)
                          : '—'
                      ],
                      [
                        'Parking rate',
                        project.parking_slots != null &&
                        project.parking_slots > 0 &&
                        project.parking_rate != null
                          ? `₹${project.parking_rate.toLocaleString(
                              'en-IN'
                            )} / slot`
                          : '—'
                      ],
                      [
                        'Unit Types',
                        typeOptions.length ? typeOptions.join(', ') : '—'
                      ],
                      ['Total Units', units.length]
                    ] as const
                  ).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex justify-between border-b border-slate-100 py-1.5 text-[11px] last:border-0"
                    >
                      <span className="text-slate-500">{k}</span>
                      <span className="max-w-[60%] text-right font-medium text-slate-800">
                        {v}
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  {loading ? 'Loading…' : 'Could not load project.'}
                </p>
              )}
            </div>
            <div className={cn('p-4', tabCardClass())}>
              <div className="mb-3 text-[11px] font-semibold text-slate-800">
                Live Inventory Summary
              </div>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center gap-2.5 border-b border-slate-100 py-1.5"
                >
                  <div
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ background: STATUS_COLOR[k] }}
                  />
                  <span className="flex-1 text-[11px] text-slate-500">
                    {v}
                  </span>
                  <span
                    className="text-[13px] font-bold"
                    style={{ color: STATUS_COLOR[k] }}
                  >
                    {counts[k] ?? 0}
                  </span>
                </div>
              ))}
              <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-xs font-bold text-slate-800">
                <span>Total</span>
                <span>{units.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'Grid View' && (
        <>
          <div
            className={cn(
              'flex flex-wrap items-center gap-2.5 px-4 py-3',
              tabCardClass()
            )}
          >
            <select
              value={structFilter}
              onChange={(e) => setStructFilter(e.target.value)}
              className="max-w-[220px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800"
            >
              <option value="All">All structures</option>
              {structureOptions.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
            <select
              value={floorFilter}
              onChange={(e) => setFloorFilter(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800"
            >
              {floorOptions.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <div className="flex-1" />
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1">
                <div
                  className="h-3 w-3 rounded-sm"
                  style={{ background: STATUS_COLOR[k] }}
                />
                <span className="text-[10px] text-slate-500">
                  {v} ({counts[k] ?? 0})
                </span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <div
              className={cn(
                'min-w-0 flex-1 overflow-x-auto p-4',
                tabCardClass()
              )}
            >
              {uniqueWingsGrid.map((wing) => {
                const wingUnits = filteredGrid.filter(
                  (u) => u.wing_name === wing
                );
                const wingFloors = [
                  ...new Set(wingUnits.map((u) => u.floor))
                ].sort((a, b) => Number(b) - Number(a));
                const wingMaxUnitsPerFloor = Math.max(
                  1,
                  ...wingFloors.map((floor) => {
                    const flUnits = wingUnits.filter((u) => u.floor === floor);
                    return Math.max(
                      ...flUnits.map((u) => Number(u.unit_no) || 0),
                      flUnits.length || 0,
                      1
                    );
                  })
                );
                return (
                  <div key={wing} className="mb-4">
                    <div className="mb-2 inline-block rounded bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-500">
                      {wing}
                    </div>
                    <table className="border-collapse">
                      <thead>
                        <tr>
                          <th className="w-16 px-2 py-0.5 text-left text-[9px] font-semibold text-slate-400">
                            Floor
                          </th>
                          {[...Array(wingMaxUnitsPerFloor)].map((_, i) => (
                            <th
                              key={i}
                              className="px-2 py-0.5 text-center text-[9px] font-semibold text-slate-400"
                            >
                              Unit {i + 1}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {wingFloors.map((floor) => {
                          const key = `${wing}||${floor}`;
                          const flUnits = (unitsByWingFloor[key] || [])
                            .slice()
                            .sort(
                              (a, b) =>
                                (Number(a.unit_no) || 0) -
                                (Number(b.unit_no) || 0)
                            );
                          const trailingEmpty = Math.max(
                            0,
                            wingMaxUnitsPerFloor - flUnits.length
                          );
                          return (
                            <tr key={String(floor)}>
                              <td className="px-2 py-1 align-middle text-[10px] font-medium text-slate-500">
                                {formatFloorChipLabel(floor, undefined)}
                              </td>
                              {flUnits.map((unit) => (
                                <td
                                  key={unit.id}
                                  className="px-1.5 py-1 text-center align-middle"
                                >
                                  <UnitCell
                                    unit={unit}
                                    onClick={(u) => setSelected(u)}
                                  />
                                </td>
                              ))}
                              {[...Array(trailingEmpty)].map((_, i) => (
                                <td
                                  key={`e-${i}`}
                                  className="px-1.5 py-1 text-center align-middle"
                                >
                                  <div className="inline-block h-[30px] w-[30px] rounded-[5px] bg-slate-50" />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {!loading && uniqueWingsGrid.length === 0 ? (
                <p className="text-sm text-slate-400">No units in this view.</p>
              ) : null}
            </div>

            {selected && tab === 'Grid View' ? (
              <div
                className={cn(
                  'w-[220px] shrink-0 self-start p-4',
                  tabCardClass()
                )}
              >
                <div className="mb-3 flex justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800">
                      {selected.unit_code}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    ×
                  </button>
                </div>
                {(
                  [
                    ['Wing', selected.wing_name],
                    [
                      'Floor',
                      formatFloorLabel(selected.floor, selected.unit_type)
                    ],
                    ['Type', selected.unit_type ?? '—'],
                    ['Area', `${selected.area ?? '—'} Sq.Ft.`],
                    [
                      'Rate',
                      selected.rate != null
                        ? `₹ ${Number(selected.rate).toLocaleString('en-IN')}/sq.ft`
                        : '—'
                    ],
                    [
                      'Value',
                      formatAgreementValueCompact(selected.area, selected.rate)
                    ],
                    ['Status', STATUS_LABEL[selected.status] ?? selected.status]
                  ] as const
                ).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between border-b border-slate-50 py-1 text-[11px]"
                  >
                    <span className="text-slate-500">{k}</span>
                    <span className="font-medium text-slate-800">{v}</span>
                  </div>
                ))}
                {selected.status === 'A' ? (
                  <Button
                    className="mt-3 w-full text-[11px]"
                    onClick={() => router.push('/crm/bookings')}
                  >
                    + Create Booking
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      )}

      {tab === 'Unit List' && (
        <div className={cn('relative p-4', tabCardClass())}>
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search unit name / wing…"
              className="h-8 max-w-[180px] text-[11px]"
            />
            <select
              value={structListF}
              onChange={(e) => setStructListF(e.target.value)}
              className="max-w-[200px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px]"
            >
              <option value="All">All structures</option>
              {structureOptions.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
            <select
              value={statusF}
              onChange={(e) =>
                setStatusF(e.target.value as typeof statusF)
              }
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px]"
            >
              <option value="All">All Status</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={typeF}
              onChange={(e) => setTypeF(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px]"
            >
              <option value="All">All Types</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div className="flex-1" />
            <span className="text-[11px] text-slate-400">
              {filteredList.length} units
            </span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              {loading ? 'Loading…' : 'Refresh'}
            </Button>
          </div>

          <div className="max-h-[420px] overflow-y-auto rounded-md border border-slate-100">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-[1] bg-slate-50">
                <tr>
                  {[
                    'Unit No.',
                    'Wing',
                    'Floor',
                    'Type',
                    'Area (sq.ft)',
                    'Rate (₹/sq.ft)',
                    'Agreement value',
                    'Status',
                    'Action'
                  ].map((h) => (
                    <th
                      key={h}
                      className="border-b border-slate-200 px-3 py-2 text-left text-[10px] font-semibold text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredList.map((u) => (
                  <tr
                    key={u.id}
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                    onClick={() => openDetail(u)}
                  >
                    <td className="px-3 py-2 text-[11px] font-semibold text-slate-800">
                      {u.unit_code}
                    </td>
                    <td className="max-w-[140px] px-3 py-2 text-[11px] text-slate-500">
                      {u.wing_name}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-500">
                      {formatFloorLabel(u.floor, u.unit_type)}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-500">
                      {u.unit_type ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-800">
                      {u.area ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-800">
                      {(Number(u.rate) || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-semibold text-blue-500">
                      {formatAgreementValueCompact(u.area, u.rate)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge code={u.status} />
                    </td>
                    <td
                      className="px-3 py-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="mr-1.5 rounded border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-600 hover:bg-green-100"
                        onClick={() => setEditUnit(u)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-100"
                        onClick={() => openDetail(u)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Floor Plan' && (
        <div className={cn('p-4', tabCardClass())}>
          <div className="mb-3.5 flex flex-wrap gap-2">
            {leafFloorPlan.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => {
                  setFloorPlanWing(o);
                  setFloorPlanFloor(null);
                }}
                className={cn(
                  'rounded-md border px-4 py-1.5 text-[11px]',
                  effectiveFloorPlanWing === o
                    ? 'border-blue-500 bg-blue-50 font-semibold text-blue-500'
                    : 'border-slate-200 bg-white text-slate-500'
                )}
              >
                {o}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <div className="flex w-20 flex-col gap-1">
              <div className="mb-1 text-center text-[9px] font-semibold text-slate-400">
                FLOOR
              </div>
              {floorsFp.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFloorPlanFloor(f)}
                  className={cn(
                    'rounded-md border px-1 py-1.5 text-center text-[11px]',
                    displayFloorFp === f
                      ? 'border-blue-500 bg-blue-50 font-bold text-blue-500'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  )}
                >
                  {formatFloorChipLabel(f, undefined)}
                </button>
              ))}
            </div>

            <div className="min-w-0 flex-1 rounded-[10px] bg-slate-50 p-5">
              <div className="mb-4 text-center text-xs font-semibold text-slate-800">
                {effectiveFloorPlanWing} —{' '}
                {displayFloorFp != null
                  ? formatFloorLabel(displayFloorFp, undefined)
                  : '—'}
              </div>
              <div className="flex justify-center gap-4">
                <div className="flex flex-col gap-3">
                  {floorUnitsFp
                    .slice(0, Math.ceil(floorUnitsFp.length / 2))
                    .map((u) => {
                      const c = STATUS_COLOR[u.status] ?? '#94A3B8';
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => openDetail(u)}
                          className="w-[110px] rounded-[10px] border-2 p-3.5 text-center transition hover:scale-[1.04]"
                          style={{
                            background: `${c}18`,
                            borderColor: c
                          }}
                        >
                          <div
                            className="text-[13px] font-bold"
                            style={{ color: c }}
                          >
                            {u.unit_code}
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            {u.unit_type ?? '—'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {u.area ?? '—'} sq.ft
                          </div>
                          <div
                            className="mt-1.5 inline-block rounded-lg px-1.5 py-0.5 text-[9px] font-bold"
                            style={{
                              color: c,
                              background: `${c}22`
                            }}
                          >
                            {STATUS_LABEL[u.status] ?? u.status}
                          </div>
                        </button>
                      );
                    })}
                </div>
                <div className="flex w-9 shrink-0 items-center justify-center rounded bg-slate-200">
                  <div
                    className="text-[8px] font-semibold tracking-wide text-slate-400"
                    style={{
                      writingMode: 'vertical-rl',
                      textOrientation: 'mixed'
                    }}
                  >
                    CORRIDOR
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  {floorUnitsFp
                    .slice(Math.ceil(floorUnitsFp.length / 2))
                    .map((u) => {
                      const c = STATUS_COLOR[u.status] ?? '#94A3B8';
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => openDetail(u)}
                          className="w-[110px] rounded-[10px] border-2 p-3.5 text-center transition hover:scale-[1.04]"
                          style={{
                            background: `${c}18`,
                            borderColor: c
                          }}
                        >
                          <div
                            className="text-[13px] font-bold"
                            style={{ color: c }}
                          >
                            {u.unit_code}
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            {u.unit_type ?? '—'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {u.area ?? '—'} sq.ft
                          </div>
                          <div
                            className="mt-1.5 inline-block rounded-lg px-1.5 py-0.5 text-[9px] font-bold"
                            style={{
                              color: c,
                              background: `${c}22`
                            }}
                          >
                            {STATUS_LABEL[u.status] ?? u.status}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1">
                    <div
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ background: STATUS_COLOR[k] }}
                    />
                    <span className="text-[10px] text-slate-500">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'Map 3D' && (
        <div className="grid min-h-[540px] grid-cols-1 gap-3 lg:grid-cols-[300px_1fr]">
          <div
            className={cn(
              'flex flex-col gap-2.5 overflow-hidden p-3',
              tabCardClass()
            )}
          >
            <div className="text-xs font-bold text-slate-800">
              Unit Abstraction
            </div>
            <p className="text-[10px] leading-relaxed text-slate-500">
              Full MapLibre GL + 3D extrusions (as in the POS prototype) are not
              bundled in this app. Use the grid and floor plan tabs for spatial
              views; install <code className="text-slate-700">maplibre-gl</code>{' '}
              and wire scene GeoJSON to enable an interactive map here.
            </p>
            <div className="rounded-lg border border-dashed border-slate-300 p-2.5 text-[10px] text-slate-500">
              No map layer — placeholder matches prototype layout.
            </div>
            <div className="max-h-[280px] overflow-y-auto border-t border-slate-100 pt-2">
              {[...new Set(units.map((u) => u.wing_name))]
                .sort()
                .map((wing) => (
                  <div key={wing} className="mb-2.5">
                    <div className="mb-1.5 text-[10px] font-bold text-slate-700">
                      {wing}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {units
                        .filter((u) => u.wing_name === wing)
                        .slice(0, 24)
                        .map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            title={u.unit_code}
                            onClick={() => openDetail(u)}
                            className={cn(
                              'cursor-pointer rounded-full border px-2 py-1 text-[9px]',
                              selected?.id === u.id
                                ? 'border-blue-700 bg-blue-50 text-blue-700'
                                : 'border-slate-200 bg-white text-slate-600'
                            )}
                          >
                            {u.unit_code}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
          <div
            className={cn(
              'flex min-h-[320px] items-center justify-center overflow-hidden border border-slate-200 shadow-sm lg:min-h-full',
              tabCardClass()
            )}
          >
            <div className="text-center text-sm text-slate-400">
              Map viewport (3D)
            </div>
          </div>
        </div>
      )}

      {tab === 'Blocked Units' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {blockedUnits.length} unit(s) currently blocked
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="bg-slate-600 text-white hover:bg-slate-700"
              onClick={() => setShowBlockForm((v) => !v)}
            >
              + Block Unit
            </Button>
          </div>

          {showBlockForm ? (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3.5">
              <div className="mb-2.5 text-xs font-semibold text-orange-950">
                Block a Unit
              </div>
              <div className="flex flex-wrap items-end gap-2.5">
                <div className="min-w-[200px] flex-[2]">
                  <Label className="text-[10px] text-orange-900">Unit</Label>
                  <select
                    value={blockUnitId}
                    onChange={(e) => setBlockUnitId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-orange-200 bg-white px-2.5 py-2 text-[11px]"
                  >
                    <option value="">Select available unit…</option>
                    {units
                      .filter((u) => u.status === 'A')
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.unit_code} — {u.unit_type ?? '—'}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="min-w-[200px] flex-[3]">
                  <Label className="text-[10px] text-orange-900">Reason</Label>
                  <select
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    className="mt-1 w-full rounded-md border border-orange-200 bg-white px-2.5 py-2 text-[11px]"
                  >
                    <option value="">Select reason…</option>
                    {BLOCK_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  className="bg-orange-900 hover:bg-orange-950"
                  onClick={() => void blockSelected()}
                  disabled={blocking || !blockUnitId || !blockReason}
                >
                  {blocking ? 'Blocking…' : 'Block'}
                </Button>
              </div>
            </div>
          ) : null}

          <div className={cn('overflow-hidden', tabCardClass())}>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50">
                  {[
                    'Unit No.',
                    'Type',
                    'Area',
                    'Blocked Reason',
                    'Blocked On',
                    'Action'
                  ].map((h) => (
                    <th
                      key={h}
                      className="border-b border-slate-200 px-3 py-2 text-left text-[10px] font-semibold text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {blockedUnits.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-slate-100"
                  >
                    <td className="px-3 py-2 text-[11px] font-semibold text-slate-800">
                      {u.unit_code}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-500">
                      {u.unit_type ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-500">
                      {u.area ?? '—'} sq.ft
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold text-red-600">
                        {u.blocked_reason ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-500">
                      {u.blocked_on
                        ? new Date(u.blocked_on).toLocaleDateString('en-IN')
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-600 hover:bg-green-100"
                        onClick={() => void unblock(u.id)}
                      >
                        Unblock
                      </button>
                    </td>
                  </tr>
                ))}
                {blockedUnits.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-10 text-center text-xs text-slate-300"
                    >
                      No units are currently blocked.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <UnitDetailDialog
        unit={selected}
        projectId={activeProjectId}
        projectName={projectName}
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o);
          if (!o) setSelected(null);
        }}
        onCreateBooking={() => router.push('/crm/bookings')}
      />

      <UnitEditDialog
        unit={editUnit}
        open={!!editUnit}
        onOpenChange={(o) => {
          if (!o) setEditUnit(null);
        }}
        onSaved={() => void load()}
      />
    </div>
  );
}

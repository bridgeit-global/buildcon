'use client';

import Link from 'next/link';
import { pageError, toast } from '@/lib/toast';
import { unitBlockSchema, unitEditSchema } from '@/lib/inventory/unit-edit.schema';
import { FormFieldError } from '@/components/ui/form-field-error';
import { TextInputField } from '@/components/ui/text-input-field';
import { useFieldValidation } from '@/lib/form/zod-field-errors';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useCrmProjectsContext } from '../_components/active-project-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { formatDisplayDate } from '@/lib/format-display-date';
import { cn } from '@/lib/utils';
import { formatBookingDisplayId } from '@/lib/booking/allotment-letter-print';
import {
  formatInrCompactLacCr,
  formatUnitAgreementValueCompact,
  unitAgreementTotalInr,
  unitBaseAgreementInr,
  unitBillableAreaSqft
} from '../inr-format';
import {
  STATUS_COLOR,
  STATUS_LABEL,
  formatFloorChipLabel,
  formatFloorLabel,
  isUnitAvailableForBooking,
  isUnitBlockedStatus,
  isUnitLinkedToBookingRecord,
  normalizeUnitStatusCode,
  statusLabelForUnit,
  UNIT_STATUS_CODES,
  unitStatusGridAbbrev
} from './inventory-utils';
import { writeBookingPrefill } from '../booking-prefill-storage';

type UnitProjectMeta = {
  name: string;
  parking_slots: number | null;
  parking_rate: number | null;
};

type UnitRow = {
  id: string;
  project_id: string;
  unit_code: string;
  wing_name: string;
  floor: number;
  unit_no: number;
  unit_type: string | null;
  area: number | null;
  carpet_area: number | null;
  bua_area: number | null;
  rera_area: number | null;
  terrace_sqft: number | null;
  deck_sqft: number | null;
  loading_sqft: number | null;
  floor_rise_charge: number | null;
  plc_charge: number | null;
  parking_slots_included: number | null;
  rate: number | null;
  status: string;
  blocked_reason: string | null;
  blocked_on: string | null;
  projects?: UnitProjectMeta | UnitProjectMeta[] | null;
};

const INVENTORY_ALL_PROJECTS = 'all';

const UNIT_SELECT =
  'id,project_id,unit_code,wing_name,floor,unit_no,unit_type,area,carpet_area,bua_area,rera_area,terrace_sqft,deck_sqft,loading_sqft,floor_rise_charge,plc_charge,parking_slots_included,rate,status,blocked_reason,blocked_on';

function unitProjectMeta(unit: UnitRow): UnitProjectMeta | null {
  const p = unit.projects;
  if (!p) return null;
  return Array.isArray(p) ? p[0] ?? null : p;
}

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
  'Other'
];

const UNIT_STATUS_SET = new Set<string>(UNIT_STATUS_CODES);

function normalizeCsvHeader(cell: string) {
  return cell
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function parseCsvRows(text: string): Record<string, string>[] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(normalizeCsvHeader);
  const out: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]
      .split(',')
      .map((c) => c.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (h) row[h] = cells[j] ?? '';
    });
    out.push(row);
  }
  return out;
}

function csvNumeric(v: string | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function csvRowToUnitUpsert(
  projectId: string,
  raw: Record<string, string>
): Record<string, unknown> | null {
  const unit_code = (raw.unit_code || raw.code || '').trim();
  if (!unit_code) return null;
  const wing_name =
    (raw.wing_name || raw.wing || raw.structure || '').trim() || 'Default';
  const n = (k: string, alt?: string) =>
    csvNumeric(raw[k]) ?? (alt ? csvNumeric(raw[alt]) : null);
  const floor = n('floor') ?? 1;
  const unit_no = n('unit_no') ?? n('slot') ?? 1;
  const payload: Record<string, unknown> = {
    project_id: projectId,
    unit_code,
    wing_name,
    floor,
    unit_no,
    unit_type: (raw.unit_type || raw.type || '').trim() || null,
    area: n('area') ?? 1,
    carpet_area: n('carpet_area', 'carpet'),
    bua_area: n('bua_area', 'bua'),
    rera_area: n('rera_area', 'rera'),
    terrace_sqft: n('terrace_sqft', 'terrace'),
    deck_sqft: n('deck_sqft', 'deck'),
    loading_sqft: n('loading_sqft', 'loading'),
    rate: n('rate') ?? 1,
    floor_rise_charge: n('floor_rise_charge', 'floor_rise') ?? 0,
    plc_charge: n('plc_charge', 'plc') ?? 0,
    parking_slots_included: Math.max(
      0,
      Math.floor(n('parking_slots_included', 'parking') ?? 0)
    )
  };
  const statusRaw = (raw.status || '').trim().toUpperCase();
  if (statusRaw && UNIT_STATUS_SET.has(statusRaw)) {
    payload.status = statusRaw;
  }
  return payload;
}

const TABS = [
  'Grid View',
  'Unit List',
  'Inventory Info',
  'Floor Plan',
  'Map 3D',
  'Blocked Units'
] as const;

type InventoryTab = (typeof TABS)[number];

function inventoryTabLabel(t: InventoryTab) {
  return t === 'Map 3D' ? 'Map 3D (soon)' : t;
}

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
  const label = statusLabelForUnit(code);
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
  onCreateBooking: (unit: UnitRow) => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [booking, setBooking] = useState<BookingPreview | null>(null);

  useEffect(() => {
    if (!open || !unit || !projectId) {
      setBooking(null);
      return;
    }
    if (!isUnitLinkedToBookingRecord(unit.status)) {
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
  const billable = unitBillableAreaSqft(unit);
  const baseInr = unitBaseAgreementInr(unit);
  const totalInr = unitAgreementTotalInr(unit);
  const bookedOn = formatDisplayDate(booking?.created_at);

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
                [
                  'Carpet (sq.ft)',
                  unit.carpet_area != null && Number(unit.carpet_area) > 0
                    ? String(unit.carpet_area)
                    : '—'
                ],
                [
                  'BUA (sq.ft)',
                  unit.bua_area != null && Number(unit.bua_area) > 0
                    ? String(unit.bua_area)
                    : '—'
                ],
                [
                  'RERA (sq.ft)',
                  unit.rera_area != null && Number(unit.rera_area) > 0
                    ? String(unit.rera_area)
                    : '—'
                ],
                [
                  'Terrace / deck / loading',
                  [
                    unit.terrace_sqft != null && Number(unit.terrace_sqft) > 0
                      ? `T ${unit.terrace_sqft}`
                      : null,
                    unit.deck_sqft != null && Number(unit.deck_sqft) > 0
                      ? `D ${unit.deck_sqft}`
                      : null,
                    unit.loading_sqft != null && Number(unit.loading_sqft) > 0
                      ? `L ${unit.loading_sqft}`
                      : null
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'
                ],
                [
                  'Billable area (pricing)',
                  billable > 0 ? `${billable} sq.ft` : `${area} sq.ft (legacy)`
                ],
                ['Rate', `₹ ${rate.toLocaleString('en-IN')} / sq.ft`],
                [
                  'Floor-rise (₹)',
                  unit.floor_rise_charge != null &&
                    Number(unit.floor_rise_charge) > 0
                    ? `₹ ${Number(unit.floor_rise_charge).toLocaleString('en-IN')}`
                    : '—'
                ],
                [
                  'PLC (₹)',
                  unit.plc_charge != null && Number(unit.plc_charge) > 0
                    ? `₹ ${Number(unit.plc_charge).toLocaleString('en-IN')}`
                    : '—'
                ],
                [
                  'Parking (slots on unit)',
                  unit.parking_slots_included != null &&
                    Number(unit.parking_slots_included) > 0
                    ? String(unit.parking_slots_included)
                    : '—'
                ],
                [
                  'Base (area × rate)',
                  formatInrCompactLacCr(baseInr)
                ],
                [
                  'Agreement value (incl. rise + PLC)',
                  formatInrCompactLacCr(totalInr)
                ],
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

          {isUnitBlockedStatus(unit.status) && (
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

          {booking && isUnitLinkedToBookingRecord(unit.status) && (
            <div
              className={cn(
                'mb-4 rounded-lg border px-3 py-3',
                ['REGISTERED', 'PRE_POSSESSION', 'POSSESSED', 'S'].includes(
                  normalizeUnitStatusCode(unit.status)
                )
                  ? 'border-violet-300 bg-violet-50'
                  : 'border-blue-200 bg-blue-50'
              )}
            >
              <div
                className={cn(
                  'mb-2 text-[10px] font-bold uppercase',
                  ['REGISTERED', 'PRE_POSSESSION', 'POSSESSED', 'S'].includes(
                    normalizeUnitStatusCode(unit.status)
                  )
                    ? 'text-violet-800'
                    : 'text-blue-800'
                )}
              >
                {['REGISTERED', 'PRE_POSSESSION', 'POSSESSED', 'S'].includes(
                  normalizeUnitStatusCode(unit.status)
                )
                  ? 'Sale / registration stage'
                  : 'Active booking'}
              </div>
              <div
                className={cn(
                  'grid grid-cols-2 gap-2 text-[11px]',
                  ['REGISTERED', 'PRE_POSSESSION', 'POSSESSED', 'S'].includes(
                    normalizeUnitStatusCode(unit.status)
                  )
                    ? 'text-violet-950'
                    : 'text-blue-950'
                )}
              >
                <div>
                  <span className="text-slate-500">Booking ref</span>
                  <br />
                  <strong>
                    {formatBookingDisplayId(booking.id, booking.created_at)}
                  </strong>
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
            Carpet and BUA drive list price when set; otherwise legacy{' '}
            <code className="font-mono">area</code> is used.
          </p>
        </div>

        <DialogFooter className="gap-2 border-t border-slate-200 bg-slate-50 px-[18px] py-3 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button asChild variant="outline">
            <Link href={`/crm/units/${unit.id}`}>Open unit page</Link>
          </Button>
          {isUnitAvailableForBooking(unit.status) ? (
            <Button
              onClick={() => {
                onCreateBooking(unit);
                onOpenChange(false);
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
    carpet_area: 0,
    bua_area: 0,
    rera_area: 0,
    terrace_sqft: 0,
    deck_sqft: 0,
    loading_sqft: 0,
    rate: 0,
    floor_rise_charge: 0,
    plc_charge: 0,
    parking_slots_included: 0,
    floor: 1,
    unit_no: 1,
    status: 'AVAILABLE',
    blocked_reason: ''
  });

  useEffect(() => {
    if (!unit || !open) return;
    setForm({
      unit_code: unit.unit_code,
      unit_type: unit.unit_type ?? '',
      area: Number(unit.area) || 0,
      carpet_area: Number(unit.carpet_area) || 0,
      bua_area: Number(unit.bua_area) || 0,
      rera_area: Number(unit.rera_area) || 0,
      terrace_sqft: Number(unit.terrace_sqft) || 0,
      deck_sqft: Number(unit.deck_sqft) || 0,
      loading_sqft: Number(unit.loading_sqft) || 0,
      rate: Number(unit.rate) || 0,
      floor_rise_charge: Number(unit.floor_rise_charge) || 0,
      plc_charge: Number(unit.plc_charge) || 0,
      parking_slots_included: Number(unit.parking_slots_included) || 0,
      floor: Number(unit.floor) || 1,
      unit_no: Number(unit.unit_no) || 1,
      status: unit.status,
      blocked_reason: unit.blocked_reason ?? ''
    });
  }, [unit, open]);

  const editValidation = useFieldValidation(unitEditSchema, {
    unit_code: form.unit_code,
    area: form.area,
    rate: form.rate,
    status: form.status,
    blocked_reason: form.blocked_reason
  });

  async function save() {
    if (!unit) return;
    const parsed = editValidation.validate();
    if (!parsed.success) {
      pageError('Fix the highlighted fields before saving.');
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      unit_code: form.unit_code.trim() || unit.unit_code,
      unit_type: form.unit_type || null,
      area: Math.max(1, Number(form.area) || 1),
      carpet_area:
        Number(form.carpet_area) > 0 ? Number(form.carpet_area) : null,
      bua_area: Number(form.bua_area) > 0 ? Number(form.bua_area) : null,
      rera_area: Number(form.rera_area) > 0 ? Number(form.rera_area) : null,
      terrace_sqft:
        Number(form.terrace_sqft) > 0 ? Number(form.terrace_sqft) : null,
      deck_sqft: Number(form.deck_sqft) > 0 ? Number(form.deck_sqft) : null,
      loading_sqft:
        Number(form.loading_sqft) > 0 ? Number(form.loading_sqft) : null,
      rate: Math.max(1, Number(form.rate) || 1),
      floor_rise_charge: Math.max(0, Number(form.floor_rise_charge) || 0),
      plc_charge: Math.max(0, Number(form.plc_charge) || 0),
      parking_slots_included: Math.max(
        0,
        Math.floor(Number(form.parking_slots_included) || 0)
      ),
      floor: Number(form.floor) || 1,
      unit_no: Math.max(1, Number(form.unit_no) || 1),
      status: form.status
    };
    if (isUnitBlockedStatus(form.status)) {
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
          <div className="col-span-2 text-[10px] font-semibold uppercase text-slate-400">
            Identification
          </div>
          <TextInputField
            label="Unit code"
            labelClassName="text-[10px] text-slate-500"
            value={form.unit_code}
            onChange={(e) => {
              setForm((f) => ({ ...f, unit_code: e.target.value }));
              editValidation.touch('unit_code');
            }}
            onBlur={() => editValidation.touch('unit_code')}
            error={editValidation.fieldError('unit_code')}
            inputClassName="h-9 text-xs"
          />
          <TextInputField
            label="Type"
            labelClassName="text-[10px] text-slate-500"
            value={form.unit_type}
            onChange={(e) =>
              setForm((f) => ({ ...f, unit_type: e.target.value }))
            }
            inputClassName="h-9 text-xs"
          />
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-slate-500">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => {
                setForm((f) => ({ ...f, status: v }));
                editValidation.touch('status');
              }}
            >
              <SelectTrigger
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs shadow-none"
                aria-invalid={editValidation.fieldError('status') ? true : undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_STATUS_CODES.map((k) => (
                  <SelectItem key={k} value={k}>
                    {STATUS_LABEL[k] ?? k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormFieldError message={editValidation.fieldError('status')} />
          </div>
          <div className="col-span-2 text-[10px] font-semibold uppercase text-slate-400">
            Areas (sq.ft)
          </div>
          <TextInputField
            label="Legacy / sale area"
            labelClassName="text-[10px] text-slate-500"
            type="number"
            min={1}
            value={String(form.area)}
            onChange={(e) => {
              setForm((f) => ({
                ...f,
                area: Number(e.target.value) || 0
              }));
              editValidation.touch('area');
            }}
            onBlur={() => editValidation.touch('area')}
            error={editValidation.fieldError('area')}
            inputClassName="h-9 text-xs"
          />
          <TextInputField
            label="Carpet"
            labelClassName="text-[10px] text-slate-500"
            type="number"
            min={0}
            value={String(form.carpet_area || '')}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                carpet_area: Number(e.target.value) || 0
              }))
            }
            inputClassName="h-9 text-xs"
          />
          <TextInputField
            label="BUA"
            labelClassName="text-[10px] text-slate-500"
            type="number"
            min={0}
            value={String(form.bua_area || '')}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                bua_area: Number(e.target.value) || 0
              }))
            }
            inputClassName="h-9 text-xs"
          />
          <TextInputField
            label="RERA"
            labelClassName="text-[10px] text-slate-500"
            type="number"
            min={0}
            value={String(form.rera_area || '')}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                rera_area: Number(e.target.value) || 0
              }))
            }
            inputClassName="h-9 text-xs"
          />
          <TextInputField
            label="Terrace"
            labelClassName="text-[10px] text-slate-500"
            type="number"
            min={0}
            value={String(form.terrace_sqft || '')}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                terrace_sqft: Number(e.target.value) || 0
              }))
            }
            inputClassName="h-9 text-xs"
          />
          <TextInputField
            label="Deck"
            labelClassName="text-[10px] text-slate-500"
            type="number"
            min={0}
            value={String(form.deck_sqft || '')}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                deck_sqft: Number(e.target.value) || 0
              }))
            }
            inputClassName="h-9 text-xs"
          />
          <TextInputField
            label="Loading"
            labelClassName="text-[10px] text-slate-500"
            type="number"
            min={0}
            value={String(form.loading_sqft || '')}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                loading_sqft: Number(e.target.value) || 0
              }))
            }
            inputClassName="h-9 text-xs"
          />
          <div className="col-span-2 text-[10px] font-semibold uppercase text-slate-400">
            Pricing (₹)
          </div>
          <TextInputField
            label="Rate (₹/sq.ft)"
            labelClassName="text-[10px] text-slate-500"
            type="number"
            min={1}
            value={String(form.rate)}
            onChange={(e) => {
              setForm((f) => ({
                ...f,
                rate: Number(e.target.value) || 0
              }));
              editValidation.touch('rate');
            }}
            onBlur={() => editValidation.touch('rate')}
            error={editValidation.fieldError('rate')}
            inputClassName="h-9 text-xs"
          />
          <TextInputField
            label="Floor-rise (lump)"
            labelClassName="text-[10px] text-slate-500"
            type="number"
            min={0}
            value={String(form.floor_rise_charge)}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                floor_rise_charge: Number(e.target.value) || 0
              }))
            }
            inputClassName="h-9 text-xs"
          />
          <TextInputField
            label="PLC (lump)"
            labelClassName="text-[10px] text-slate-500"
            type="number"
            min={0}
            value={String(form.plc_charge)}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                plc_charge: Number(e.target.value) || 0
              }))
            }
            inputClassName="h-9 text-xs"
          />
          <TextInputField
            label="Parking slots (unit)"
            labelClassName="text-[10px] text-slate-500"
            type="number"
            min={0}
            value={String(form.parking_slots_included)}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                parking_slots_included: Number(e.target.value) || 0
              }))
            }
            inputClassName="h-9 text-xs"
          />
          <div className="col-span-2 text-[10px] font-semibold uppercase text-slate-400">
            Position
          </div>
          <TextInputField
            label="Floor"
            labelClassName="text-[10px] text-slate-500"
            type="number"
            value={String(form.floor)}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                floor: Number(e.target.value) || 0
              }))
            }
            inputClassName="h-9 text-xs"
          />
          <TextInputField
            label="Unit slot"
            labelClassName="text-[10px] text-slate-500"
            type="number"
            min={1}
            value={String(form.unit_no)}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                unit_no: Number(e.target.value) || 1
              }))
            }
            inputClassName="h-9 text-xs"
          />
          {isUnitBlockedStatus(form.status) ? (
            <TextInputField
              className="col-span-2"
              label="Blocked reason"
              labelClassName="text-[10px] text-slate-500"
              value={form.blocked_reason}
              onChange={(e) => {
                setForm((f) => ({ ...f, blocked_reason: e.target.value }));
                editValidation.touch('blocked_reason');
              }}
              onBlur={() => editValidation.touch('blocked_reason')}
              error={editValidation.fieldError('blocked_reason')}
              placeholder="Reason for blocking"
              inputClassName="h-9 text-xs"
            />
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
  const total = unitAgreementTotalInr(unit);
  const bill = unitBillableAreaSqft(unit);
  const title = `${unit.unit_code} · ${statusLabelForUnit(unit.status)} · ${formatInrCompactLacCr(total)} · ${bill || Number(unit.area) || 0} sq.ft billable`;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={() => onClick(unit)}
      className="flex h-[76px] w-[76px] shrink-0 cursor-pointer flex-col items-stretch justify-between rounded-lg border-2 bg-white px-1 py-1 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderColor: bg }}
    >
      <div className="truncate text-[8px] font-bold leading-tight text-slate-800">
        {unit.unit_code}
      </div>
      <div
        className="self-center text-[11px] font-black leading-none"
        style={{ color: bg }}
      >
        {unitStatusGridAbbrev(unit.status)}
      </div>
      <div className="truncate text-[8px] font-semibold leading-tight text-slate-600">
        {formatInrCompactLacCr(total)}
      </div>
      <div
        className="rounded px-0.5 py-px text-center text-[7px] font-bold text-white"
        style={{ background: bg }}
      >
        {bill > 0 ? `${bill}` : `${Number(unit.area) || '—'}`} sf
      </div>
    </button>
  );
}

function InventoryPageContent() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { projects } = useCrmProjectsContext();
  const projectNameById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );
  const [inventoryProjectId, setInventoryProjectId] = useState<
    string | typeof INVENTORY_ALL_PROJECTS
  >(INVENTORY_ALL_PROJECTS);
  const isAllProjects = inventoryProjectId === INVENTORY_ALL_PROJECTS;
  const singleProjectId = isAllProjects ? null : inventoryProjectId;

  const [tab, setTab] = useState<InventoryTab>('Grid View');
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [wingNames, setWingNames] = useState<string[]>([]);
  const [unitTypeNames, setUnitTypeNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [structFilter, setStructFilter] = useState('All');
  const [floorFilter, setFloorFilter] = useState('all');

  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState<string>('All');
  const [typeF, setTypeF] = useState('All');
  const [structListF, setStructListF] = useState('All');

  const [selected, setSelected] = useState<UnitRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editUnit, setEditUnit] = useState<UnitRow | null>(null);

  const [blockUnitId, setBlockUnitId] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [blocking, setBlocking] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState(false);

  const blockValidation = useFieldValidation(unitBlockSchema, {
    blockUnitId,
    blockReason
  });

  const [floorPlanWing, setFloorPlanWing] = useState<string>('');
  const [floorPlanFloor, setFloorPlanFloor] = useState<number | null>(null);

  const [bulkCsv, setBulkCsv] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    const id = searchParams.get('projectId');
    if (id && projects.some((p) => p.id === id)) {
      setInventoryProjectId(id);
    }
  }, [searchParams, projects]);

  const load = useCallback(async () => {
    setLoading(true);
    
    if (isAllProjects) {
      const { data, error: unitsErr } = await supabase
        .from('units')
        .select(`${UNIT_SELECT}, projects ( name, parking_slots, parking_rate )`)
        .order('wing_name', { ascending: true })
        .order('floor', { ascending: false })
        .order('unit_no', { ascending: true });

      if (unitsErr) pageError(unitsErr.message);
      setUnits((data ?? []) as UnitRow[]);
      setProject(null);
      setWingNames([]);
      setUnitTypeNames([]);
      setLoading(false);
      return;
    }

    const [unitsRes, projRes, wingsRes, typesRes] = await Promise.all([
      supabase
        .from('units')
        .select(UNIT_SELECT)
        .eq('project_id', singleProjectId!)
        .order('wing_name', { ascending: true })
        .order('floor', { ascending: false })
        .order('unit_no', { ascending: true }),
      supabase
        .from('projects')
        .select(
          'name, location, rera_no, floors_per_wing, units_per_floor, parking_slots, parking_rate'
        )
        .eq('id', singleProjectId!)
        .maybeSingle(),
      supabase
        .from('project_wings')
        .select('name')
        .eq('project_id', singleProjectId!)
        .order('sort_order', { ascending: true }),
      supabase
        .from('project_unit_types')
        .select('name')
        .eq('project_id', singleProjectId!)
        .order('sort_order', { ascending: true })
    ]);

    if (unitsRes.error) pageError(unitsRes.error.message);
    setUnits((unitsRes.data ?? []) as UnitRow[]);

    if (projRes.data) setProject(projRes.data as ProjectRow);
    else setProject(null);

    const wingList =
      wingsRes.data?.map((w: { name: string }) => w.name) ?? [];
    setWingNames(wingList);

    const typeList =
      typesRes.data?.map((t: { name: string }) => t.name) ?? [];
    setUnitTypeNames(typeList);

    setLoading(false);
  }, [isAllProjects, singleProjectId, supabase]);

  const runBulkImport = useCallback(async () => {
    if (isAllProjects || !singleProjectId || !bulkCsv.trim()) return;
    setBulkBusy(true);
    const rows = parseCsvRows(bulkCsv);
    if (!rows.length) {
      toast.warning('Add a header row and at least one data row.');
      setBulkBusy(false);
      return;
    }
    const payloads: Record<string, unknown>[] = [];
    let skipped = 0;
    for (const r of rows) {
      const p = csvRowToUnitUpsert(singleProjectId, r);
      if (p) payloads.push(p);
      else skipped++;
    }
    if (!payloads.length) {
      toast.warning('No valid rows (each row needs unit_code).');
      setBulkBusy(false);
      return;
    }
    const BATCH = 40;
    try {
      for (let i = 0; i < payloads.length; i += BATCH) {
        const chunk = payloads.slice(i, i + BATCH);
        const { error } = await supabase
          .from('units')
          .upsert(chunk, { onConflict: 'project_id,unit_code' });
        if (error) {
          pageError(error.message);
          return;
        }
      }
      toast.success(
        `Upserted ${payloads.length} unit(s).` +
          (skipped ? ` Skipped ${skipped} row(s) without unit_code.` : '')
      );
      setBulkCsv('');
      await load();
    } finally {
      setBulkBusy(false);
    }
  }, [isAllProjects, singleProjectId, bulkCsv, load, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelected((prev) => {
      if (!prev) return prev;
      return units.find((u) => u.id === prev.id) ?? null;
    });
  }, [units]);

  useEffect(() => {
    setEditUnit((prev) => {
      if (!prev) return prev;
      return units.find((u) => u.id === prev.id) ?? prev;
    });
  }, [units]);

  useEffect(() => {
    if (isAllProjects || !singleProjectId) return;
    const channel = supabase
      .channel(`units-inv-${singleProjectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'units',
          filter: `project_id=eq.${singleProjectId}`
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAllProjects, singleProjectId, supabase, load]);

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

  const labelForUnitProject = useCallback(
    (unit: UnitRow) => {
      if (!isAllProjects) return projectName;
      return (
        unitProjectMeta(unit)?.name ??
        projectNameById.get(unit.project_id) ??
        unit.project_id
      );
    },
    [isAllProjects, projectName, projectNameById]
  );

  const navigateToBookingForUnit = useCallback(
    (unit: UnitRow) => {
      if (!isUnitAvailableForBooking(unit.status)) return;
      const meta = unitProjectMeta(unit);
      writeBookingPrefill({
        projectId: unit.project_id,
        inquiryId: null,
        inquiryRef: null,
        customerId: null,
        unitId: unit.id,
        parkingRequired: 'No',
        parkingCount: '1',
        parkingSlotsAvailable: isAllProjects
          ? meta?.parking_slots ?? null
          : project?.parking_slots ?? null,
        parkingRateSnapshot: isAllProjects
          ? meta?.parking_rate ?? null
          : project?.parking_rate ?? null
      });
      router.push('/crm/bookings');
    },
    [isAllProjects, project?.parking_rate, project?.parking_slots, router]
  );

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
    for (const k of UNIT_STATUS_CODES) c[k] = 0;
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
    () => units.filter((u) => isUnitBlockedStatus(u.status)),
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
    const parsed = blockValidation.validate();
    if (!parsed.success) {
      pageError('Select a unit and reason before blocking.');
      return;
    }
    setBlocking(true);
        const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from('units')
      .update({
        status: 'BLOCKED',
        blocked_reason: blockReason,
        blocked_on: today
      })
      .eq('id', blockUnitId)
      .eq('status', 'AVAILABLE');

    if (error) pageError(error.message);
    setBlockUnitId('');
    setBlockReason('');
    setShowBlockForm(false);
    await load();
    setBlocking(false);
  }

  async function unblock(unitId: string) {
        const { error } = await supabase
      .from('units')
      .update({
        status: 'AVAILABLE',
        blocked_reason: null,
        blocked_on: null
      })
      .eq('id', unitId)
      .eq('status', 'BLOCKED');
    if (error) pageError(error.message);
    await load();
  }

  function openDetail(u: UnitRow) {
    setSelected(u);
    setDetailOpen(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 px-4 py-3',
          tabCardClass()
        )}
      >
        <div>
          <h1 className="text-base font-semibold text-slate-800">Inventory</h1>
          <p className="text-[11px] text-slate-500">
            {isAllProjects
              ? 'All projects — unit list and filters; pick one project for grid, floor plan, and bulk import.'
              : projectName || 'Single project view'}
          </p>
        </div>
        <Select
          value={inventoryProjectId}
          onValueChange={(v) => setInventoryProjectId(v)}
        >
          <SelectTrigger
            size="sm"
            className="min-w-[200px] max-w-[min(100%,320px)] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-none"
          >
            <SelectValue placeholder="Filter by project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={INVENTORY_ALL_PROJECTS}>All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
            {inventoryTabLabel(t)}
          </button>
        ))}
      </div>

      {tab === 'Inventory Info' && (
        <div className="flex flex-col gap-3.5">
          {isAllProjects ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-600">
              Select a single project from the filter above to view project
              configuration, live summary for one site, and bulk CSV import.
            </div>
          ) : (
            <>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-[11px] text-blue-600">
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
              {UNIT_STATUS_CODES.map((k) => {
                const v = STATUS_LABEL[k] ?? k;
                return (
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
                );
              })}
              <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-xs font-bold text-slate-800">
                <span>Total</span>
                <span>{units.length}</span>
              </div>
            </div>
          </div>
          <div className={cn('p-4', tabCardClass())}>
            <div className="mb-2 text-[11px] font-semibold text-slate-800">
              Bulk unit import (CSV)
            </div>
            <p className="mb-2 text-[10px] leading-relaxed text-slate-500">
              Header row required. Required column:{' '}
              <code className="font-mono">unit_code</code>. Optional: wing_name,
              floor, unit_no, unit_type, area, carpet_area, bua_area, rera_area,
              terrace_sqft, deck_sqft, loading_sqft, rate, floor_rise_charge,
              plc_charge, parking_slots_included, status. Each row upserts on
              this project + unit code (simple CSV—avoid commas inside cells).
            </p>
            <Textarea
              value={bulkCsv}
              onChange={(e) => setBulkCsv(e.target.value)}
              placeholder="unit_code,wing_name,floor,unit_no,rate,carpet_area,floor_rise_charge,plc_charge"
              className="min-h-[120px] font-mono text-[10px]"
              disabled={bulkBusy}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={bulkBusy || !bulkCsv.trim()}
                onClick={() => void runBulkImport()}
              >
                {bulkBusy ? 'Importing…' : 'Import / upsert'}
              </Button>
            </div>
          </div>
            </>
          )}
        </div>
      )}

      {tab === 'Grid View' && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] leading-snug text-slate-600">
            {!isAllProjects ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                Live
              </span>
            ) : null}
            <span className="font-semibold text-slate-800">Sales matrix: </span>
            filter by wing and floor; cells align to unit slots on each floor.
            Colours follow the legend; carpet/BUA and floor-rise + PLC roll into
            the list price shown on each cell.
          </div>
          <div
            className={cn(
              'flex flex-wrap items-center gap-2.5 px-4 py-3',
              tabCardClass()
            )}
          >
            <Select
              value={structFilter}
              onValueChange={setStructFilter}
            >
              <SelectTrigger
                size="sm"
                className="max-w-[220px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All structures</SelectItem>
                {structureOptions.map((w) => (
                  <SelectItem key={w} value={w}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={floorFilter} onValueChange={setFloorFilter}>
              <SelectTrigger
                size="sm"
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {floorOptions.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1" />
            {UNIT_STATUS_CODES.map((k) => {
              const v = STATUS_LABEL[k] ?? k;
              return (
                <div key={k} className="flex items-center gap-1">
                  <div
                    className="h-3 w-3 rounded-sm"
                    style={{ background: STATUS_COLOR[k] }}
                  />
                  <span className="text-[10px] text-slate-500">
                    {v} ({counts[k] ?? 0})
                  </span>
                </div>
              );
            })}
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
                          return (
                            <tr key={String(floor)}>
                              <td className="px-2 py-1 align-middle text-[10px] font-medium text-slate-500">
                                {formatFloorChipLabel(floor, undefined)}
                              </td>
                              {Array.from(
                                { length: wingMaxUnitsPerFloor },
                                (_, col) => {
                                  const slot = col + 1;
                                  const unit = flUnits.find(
                                    (u) => Number(u.unit_no) === slot
                                  );
                                  return (
                                    <td
                                      key={slot}
                                      className="px-1 py-1 text-center align-middle"
                                    >
                                      {unit ? (
                                        <UnitCell
                                          unit={unit}
                                          onClick={(u) => setSelected(u)}
                                        />
                                      ) : (
                                        <div className="inline-flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/80" />
                                      )}
                                    </td>
                                  );
                                }
                              )}
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
                  'w-[280px] shrink-0 self-start p-4',
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
                    [
                      'Carpet / BUA / RERA',
                      [
                        selected.carpet_area != null &&
                          Number(selected.carpet_area) > 0
                          ? `C ${selected.carpet_area}`
                          : null,
                        selected.bua_area != null && Number(selected.bua_area) > 0
                          ? `B ${selected.bua_area}`
                          : null,
                        selected.rera_area != null &&
                          Number(selected.rera_area) > 0
                          ? `R ${selected.rera_area}`
                          : null
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'
                    ],
                    ['Legacy area', `${selected.area ?? '—'} sq.ft`],
                    [
                      'Outdoor (T/D/L)',
                      [
                        selected.terrace_sqft != null &&
                          Number(selected.terrace_sqft) > 0
                          ? `T ${selected.terrace_sqft}`
                          : null,
                        selected.deck_sqft != null &&
                          Number(selected.deck_sqft) > 0
                          ? `D ${selected.deck_sqft}`
                          : null,
                        selected.loading_sqft != null &&
                          Number(selected.loading_sqft) > 0
                          ? `L ${selected.loading_sqft}`
                          : null
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'
                    ],
                    [
                      'Rate',
                      selected.rate != null
                        ? `₹ ${Number(selected.rate).toLocaleString('en-IN')}/sq.ft`
                        : '—'
                    ],
                    [
                      'Floor-rise + PLC',
                      [
                        selected.floor_rise_charge != null &&
                          Number(selected.floor_rise_charge) > 0
                          ? `FR ₹${Number(
                            selected.floor_rise_charge
                          ).toLocaleString('en-IN')}`
                          : null,
                        selected.plc_charge != null &&
                          Number(selected.plc_charge) > 0
                          ? `PLC ₹${Number(selected.plc_charge).toLocaleString(
                            'en-IN'
                          )}`
                          : null
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'
                    ],
                    [
                      'Parking (unit)',
                      selected.parking_slots_included != null &&
                        Number(selected.parking_slots_included) > 0
                        ? String(selected.parking_slots_included)
                        : '—'
                    ],
                    [
                      'List price',
                      formatUnitAgreementValueCompact(selected)
                    ],
                    ['Status', statusLabelForUnit(selected.status)]
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
                {isUnitAvailableForBooking(selected.status) ? (
                  <Button
                    className="mt-3 w-full text-[11px]"
                    onClick={() => navigateToBookingForUnit(selected)}
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
            <Select value={structListF} onValueChange={setStructListF}>
              <SelectTrigger
                size="sm"
                className="max-w-[200px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All structures</SelectItem>
                {structureOptions.map((w) => (
                  <SelectItem key={w} value={w}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusF}
              onValueChange={setStatusF}
            >
              <SelectTrigger
                size="sm"
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Status</SelectItem>
                {UNIT_STATUS_CODES.map((k) => (
                  <SelectItem key={k} value={k}>
                    {STATUS_LABEL[k] ?? k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeF} onValueChange={setTypeF}>
              <SelectTrigger
                size="sm"
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Types</SelectItem>
                {typeOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <span className="text-[11px] text-slate-400">
              {filteredList.length} units
            </span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              {loading ? 'Loading…' : 'Refresh'}
            </Button>
          </div>

          <div className="max-h-[420px] overflow-y-auto rounded-lg border border-ds-gray-200">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-[1] bg-ds-gray-50/80">
                <tr className="border-b border-ds-gray-100">
                  {[
                    'Unit No.',
                    ...(isAllProjects ? (['Project'] as const) : []),
                    'Wing',
                    'Floor',
                    'Type',
                    'Areas',
                    'Rate',
                    'List price',
                    'Pk',
                    'Status',
                    'Action'
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-[10px] font-semibold text-ds-gray-500"
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
                    className="cursor-pointer border-b border-ds-gray-100 last:border-0 transition-colors hover:bg-ds-gray-50/60"
                    onClick={() => openDetail(u)}
                  >
                    <td className="px-3 py-2 text-[11px] font-semibold text-ds-gray-800">
                      {u.unit_code}
                    </td>
                    {isAllProjects ? (
                      <td className="max-w-[140px] px-3 py-2 text-[11px] text-ds-gray-500">
                        {labelForUnitProject(u)}
                      </td>
                    ) : null}
                    <td className="max-w-[140px] px-3 py-2 text-[11px] text-ds-gray-500">
                      {u.wing_name}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-ds-gray-500">
                      {formatFloorLabel(u.floor, u.unit_type)}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-ds-gray-500">
                      {u.unit_type ?? '—'}
                    </td>
                    <td className="max-w-[120px] px-3 py-2 text-[10px] leading-snug text-ds-gray-700">
                      {[
                        u.carpet_area != null && Number(u.carpet_area) > 0
                          ? `C ${u.carpet_area}`
                          : null,
                        u.bua_area != null && Number(u.bua_area) > 0
                          ? `B ${u.bua_area}`
                          : null,
                        u.rera_area != null && Number(u.rera_area) > 0
                          ? `R ${u.rera_area}`
                          : null
                      ]
                        .filter(Boolean)
                        .join(' · ') || (u.area ?? '—')}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-ds-gray-800">
                      {(Number(u.rate) || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-semibold text-ds-primary-600">
                      {formatUnitAgreementValueCompact(u)}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-ds-gray-600">
                      {u.parking_slots_included != null &&
                        Number(u.parking_slots_included) > 0
                        ? String(u.parking_slots_included)
                        : '—'}
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
                            {unitBillableAreaSqft(u) || u.area || '—'} sq.ft
                            billable
                          </div>
                          <div className="text-[10px] font-semibold text-slate-700">
                            {formatUnitAgreementValueCompact(u)}
                          </div>
                          <div
                            className="mt-1.5 inline-block rounded-lg px-1.5 py-0.5 text-[9px] font-bold"
                            style={{
                              color: c,
                              background: `${c}22`
                            }}
                          >
                            {statusLabelForUnit(u.status)}
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
                            {unitBillableAreaSqft(u) || u.area || '—'} sq.ft
                            billable
                          </div>
                          <div className="text-[10px] font-semibold text-slate-700">
                            {formatUnitAgreementValueCompact(u)}
                          </div>
                          <div
                            className="mt-1.5 inline-block rounded-lg px-1.5 py-0.5 text-[9px] font-bold"
                            style={{
                              color: c,
                              background: `${c}22`
                            }}
                          >
                            {statusLabelForUnit(u.status)}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                {UNIT_STATUS_CODES.map((k) => {
                  const v = STATUS_LABEL[k] ?? k;
                  return (
                    <div key={k} className="flex items-center gap-1">
                      <div
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ background: STATUS_COLOR[k] }}
                      />
                      <span className="text-[10px] text-slate-500">{v}</span>
                    </div>
                  );
                })}
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
              Interactive map (coming soon)
            </div>
            <p className="text-[10px] leading-relaxed text-slate-500">
              Full MapLibre GL + 3D extrusions are not bundled yet. Prefer the{' '}
              <strong>Grid view</strong> tab for sales-ready inventory. To enable
              this tab, install <code className="text-slate-700">maplibre-gl</code>{' '}
              and wire scene GeoJSON.
            </p>
            <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/80 p-2.5 text-[10px] text-amber-900">
              Placeholder only — no live map layer in this build.
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
                  <Select
                    value={blockUnitId === '' ? undefined : blockUnitId}
                    onValueChange={(v) => {
                      setBlockUnitId(v);
                      blockValidation.touch('blockUnitId');
                    }}
                  >
                    <SelectTrigger
                      className="mt-1 w-full rounded-md border border-orange-200 bg-white px-2.5 py-2 text-[11px] shadow-none"
                      aria-invalid={
                        blockValidation.fieldError('blockUnitId') ? true : undefined
                      }
                    >
                      <SelectValue placeholder="Select available unit…" />
                    </SelectTrigger>
                    <SelectContent>
                      {units
                        .filter((u) => isUnitAvailableForBooking(u.status))
                        .map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.unit_code} — {u.unit_type ?? '—'}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <FormFieldError message={blockValidation.fieldError('blockUnitId')} />
                </div>
                <div className="min-w-[200px] flex-[3]">
                  <Label className="text-[10px] text-orange-900">Reason</Label>
                  <Select
                    value={blockReason === '' ? undefined : blockReason}
                    onValueChange={(v) => {
                      setBlockReason(v);
                      blockValidation.touch('blockReason');
                    }}
                  >
                    <SelectTrigger
                      className="mt-1 w-full rounded-md border border-orange-200 bg-white px-2.5 py-2 text-[11px] shadow-none"
                      aria-invalid={
                        blockValidation.fieldError('blockReason') ? true : undefined
                      }
                    >
                      <SelectValue placeholder="Select reason…" />
                    </SelectTrigger>
                    <SelectContent>
                      {BLOCK_REASONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormFieldError message={blockValidation.fieldError('blockReason')} />
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
                <tr className="border-b border-ds-gray-100 bg-ds-gray-50/80">
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
                      className="px-3 py-2 text-left text-[10px] font-semibold text-ds-gray-500"
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
                    className="border-b border-ds-gray-100 last:border-0 transition-colors hover:bg-ds-gray-50/60"
                  >
                    <td className="px-3 py-2 text-[11px] font-semibold text-ds-gray-800">
                      {u.unit_code}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-ds-gray-500">
                      {u.unit_type ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-ds-gray-500">
                      {unitBillableAreaSqft(u) || u.area || '—'} sq.ft
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-ds-error-50 px-2 py-0.5 text-[9px] font-bold text-ds-error-700">
                        {u.blocked_reason ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-ds-gray-500">
                      {formatDisplayDate(u.blocked_on)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="rounded border border-ds-success-200 bg-ds-success-25 px-2 py-0.5 text-[10px] font-semibold text-ds-success-700 hover:bg-ds-success-50"
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
                      className="px-4 py-12 text-center text-xs text-ds-gray-500"
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
        projectId={selected?.project_id ?? singleProjectId}
        projectName={selected ? labelForUnitProject(selected) : projectName}
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o);
          if (!o) setSelected(null);
        }}
        onCreateBooking={navigateToBookingForUnit}
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

export default function InventoryPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-muted-foreground">
          Loading inventory…
        </div>
      }
    >
      <InventoryPageContent />
    </Suspense>
  );
}

'use client';

import Link from 'next/link';
import { pageError, toast } from '@/lib/toast';
import { unitBlockSchema } from '@/lib/inventory/unit-edit.schema';
import { FormFieldError } from '@/components/ui/form-field-error';
import { TextInputField } from '@/components/ui/text-input-field';
import { useFieldValidation } from '@/lib/form/zod-field-errors';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useCrmProjectsStore } from '@/store/crm-projects-store';
import {
  CrmInventoryGridMatrixSkeleton,
  CrmInventoryKvRowSkeleton,
  CrmInventoryPageSkeleton
} from '../_components/crm-skeletons';
import { Button } from '@/components/ui/button';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
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
import { resolveInventoryProjectId } from './resolve-inventory-project';
import {
  csvRowToUnitUpsert,
  parseCsvRows
} from '@/lib/inventory/inventory-csv';
import { mergeLookupOptions } from '@/lib/master/master-lookup';
import { useMasterLookup } from '@/lib/master/use-master-lookup';

import { UnitStatusChip } from '@/components/ui/status-chip';
import { InventoryListTable, type UnitRow } from './inventory-list-table';
import { UnitEditDrawer } from './unit-edit-drawer';
import { useServerListSorting } from '@/components/data-table/crm-table-features';
import { resolveSortFromState } from '@/lib/crm/list-sort';

const UNIT_SELECT =
  'id,project_id,unit_code,wing_name,floor,unit_no,unit_type,unit_category,area,carpet_area,bua_area,rera_area,terrace_sqft,deck_sqft,loading_sqft,floor_rise_charge,plc_charge,parking_slots_included,rate,status,blocked_reason,blocked_on';

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
  return 'rounded-lg border border-ds-gray-200 bg-card shadow-sm';
}

const filterLabelClass = 'text-xs text-ds-gray-500';
const filterSelectClass = 'mt-1 w-full min-w-[10rem]';

function UnitDetailDialog({
  unit,
  projectId,
  projectName,
  open,
  onOpenChange,
  onCreateBooking,
  createBookingEligibility = 'available'
}: {
  unit: UnitRow | null;
  projectId: string | null;
  projectName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreateBooking: (unit: UnitRow) => void;
  createBookingEligibility?: 'available' | 'blocked';
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
        <div className="flex flex-col border-b border-border bg-gradient-to-b from-muted to-background px-[18px] py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle
                id="unit-detail-title"
                className="text-lg font-bold tracking-tight text-foreground"
              >
                {unit.unit_code}
              </DialogTitle>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {unit.wing_name} · {unit.unit_type ?? '—'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <UnitStatusChip status={unit.status} size="sm" className="px-2.5" />
              <button
                type="button"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-ds-gray-100 text-lg leading-none text-muted-foreground hover:bg-ds-gray-200"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <div className="max-h-[min(60vh,520px)] flex-1 overflow-y-auto px-[18px] py-4">
          <div className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-ds-gray-400">
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
                className="rounded-lg border border-ds-gray-100 bg-muted px-3 py-2.5"
              >
                <div className="mb-1 text-[10px] font-semibold text-ds-gray-400">
                  {label}
                </div>
                <div className="text-xs font-semibold text-ds-gray-800">{val}</div>
              </div>
            ))}
          </div>

          {isUnitBlockedStatus(unit.status) && (
            <div className="mb-4 rounded-lg border border-ds-warning-300 bg-ds-warning-50 px-3 py-3">
              <div className="mb-2 text-[10px] font-bold uppercase text-ds-warning-800">
                Blocked
              </div>
              <div className="text-xs leading-relaxed text-ds-warning-900">
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
                  ? 'border-ds-primary-300 bg-ds-primary-50'
                  : 'border-ds-primary-200 bg-ds-primary-50'
              )}
            >
              <div
                className={cn(
                  'mb-2 text-[10px] font-bold uppercase',
                  ['REGISTERED', 'PRE_POSSESSION', 'POSSESSED', 'S'].includes(
                    normalizeUnitStatusCode(unit.status)
                  )
                    ? 'text-ds-primary-800'
                    : 'text-ds-primary-800'
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
                    ? 'text-ds-primary-900'
                    : 'text-ds-primary-900'
                )}
              >
                <div>
                  <span className="text-muted-foreground">Booking ref</span>
                  <br />
                  <strong>
                    {formatBookingDisplayId(booking.id, booking.created_at)}
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Booked on</span>
                  <br />
                  <strong>{bookedOn}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Customer</span>
                  <br />
                  <strong>{booking.customers?.full_name ?? '—'}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Phone</span>
                  <br />
                  <strong>{booking.customers?.phone ?? '—'}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Booking token</span>
                  <br />
                  <strong>
                    {booking?.booking_amount != null
                      ? formatInrCompactLacCr(Number(booking.booking_amount))
                      : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Payment</span>
                  <br />
                  <strong>{booking.payment_mode ?? '—'}</strong>
                </div>
              </div>
            </div>
          )}

          <p className="text-[11px] italic text-ds-gray-400">
            Carpet and BUA drive list price when set; otherwise legacy{' '}
            <code className="font-mono">area</code> is used.
          </p>
        </div>

        <DialogFooter className="gap-2 border-t border-border bg-muted px-[18px] py-3 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button asChild variant="outline">
            <Link href={`/crm/units/${unit.id}`}>Open unit page</Link>
          </Button>
          {(createBookingEligibility === 'blocked'
            ? isUnitBlockedStatus(unit.status)
            : isUnitAvailableForBooking(unit.status)) ? (
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


function UnitCell({
  unit,
  onClick
}: {
  unit: UnitRow;
  onClick: (u: UnitRow) => void;
}) {
  const bg = STATUS_COLOR[unit.status] ?? 'var(--ds-gray-400)';
  const total = unitAgreementTotalInr(unit);
  const bill = unitBillableAreaSqft(unit);
  const title = `${unit.unit_code} · ${statusLabelForUnit(unit.status)} · ${formatInrCompactLacCr(total)} · ${bill || Number(unit.area) || 0} sq.ft billable`;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={() => onClick(unit)}
      className="flex h-[76px] w-[76px] shrink-0 cursor-pointer flex-col items-stretch justify-between rounded-lg border-2 bg-card px-1 py-1 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderColor: bg }}
    >
      <div className="truncate text-[8px] font-bold leading-tight text-ds-gray-800">
        {unit.unit_code}
      </div>
      <div
        className="self-center text-[11px] font-black leading-none"
        style={{ color: bg }}
      >
        {unitStatusGridAbbrev(unit.status)}
      </div>
      <div className="truncate text-[8px] font-semibold leading-tight text-ds-gray-600">
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
  const { activeNames: masterUnitTypes } = useMasterLookup('unit_type');
  const { activeNames: masterUnitCategories } = useMasterLookup('unit_category');
  const router = useRouter();
  const searchParams = useSearchParams();
  const projects = useCrmProjectsStore((s) => s.projects);
  const inventoryProjectId = resolveInventoryProjectId(
    projects,
    searchParams.get('projectId')
  );

  const [tab, setTab] = useState<InventoryTab>('Grid View');
  const [units, setUnits] = useState<UnitRow[]>([]);
  const { sorting, onSortingChange } = useServerListSorting();
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [wingNames, setWingNames] = useState<string[]>([]);
  const [unitTypeNames, setUnitTypeNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [structFilter, setStructFilter] = useState('All');
  const [floorFilter, setFloorFilter] = useState('all');

  const [selected, setSelected] = useState<UnitRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailBookingEligibility, setDetailBookingEligibility] = useState<
    'available' | 'blocked'
  >('available');
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

  const selectInventoryProject = useCallback(
    (projectId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('projectId', projectId);
      router.replace(`/crm/inventory?${params.toString()}`);
    },
    [router, searchParams]
  );

  const load = useCallback(async () => {
    if (!inventoryProjectId) {
      setUnits([]);
      setProject(null);
      setWingNames([]);
      setUnitTypeNames([]);
      return;
    }

    setLoading(true);

    const UNIT_DB_SORT: Record<string, string> = {
      unit_code: 'unit_code',
      wing_name: 'wing_name',
      floor: 'floor',
      unit_type: 'unit_type',
      rate: 'rate',
      status: 'status',
      parking: 'parking_slots_included'
    };
    const { column, ascending } = resolveSortFromState(
      sorting,
      UNIT_DB_SORT,
      'unit_code',
      true
    );

    const [unitsRes, projRes, wingsRes, typesRes] = await Promise.all([
      supabase
        .from('units')
        .select(UNIT_SELECT)
        .eq('project_id', inventoryProjectId)
        .order(column, { ascending })
        .order('unit_no', { ascending: true }),
      supabase
        .from('projects')
        .select(
          'name, location, rera_no, floors_per_wing, units_per_floor, parking_slots, parking_rate'
        )
        .eq('id', inventoryProjectId)
        .maybeSingle(),
      supabase
        .from('project_wings')
        .select('name')
        .eq('project_id', inventoryProjectId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('project_unit_types')
        .select('name')
        .eq('project_id', inventoryProjectId)
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
  }, [inventoryProjectId, sorting, supabase]);

  const runBulkImport = useCallback(async () => {
    if (!inventoryProjectId || !bulkCsv.trim()) return;
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
      const p = csvRowToUnitUpsert(inventoryProjectId, r);
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
  }, [inventoryProjectId, bulkCsv, load, supabase]);

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
    if (!inventoryProjectId) return;
    const channel = supabase
      .channel(`units-inv-${inventoryProjectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'units',
          filter: `project_id=eq.${inventoryProjectId}`
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [inventoryProjectId, supabase, load]);

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

  const navigateToBookingForUnit = useCallback(
    (unit: UnitRow) => {
      const allowed =
        detailBookingEligibility === 'blocked'
          ? isUnitBlockedStatus(unit.status)
          : isUnitAvailableForBooking(unit.status);
      if (!allowed) return;
      writeBookingPrefill({
        projectId: unit.project_id,
        inquiryId: null,
        inquiryRef: null,
        customerId: null,
        unitId: unit.id,
        parkingRequired: 'No',
        parkingCount: '1',
        parkingSlotsAvailable: project?.parking_slots ?? null,
        parkingRateSnapshot: project?.parking_rate ?? null
      });
      router.push('/crm/bookings');
    },
    [
      detailBookingEligibility,
      project?.parking_rate,
      project?.parking_slots,
      router
    ]
  );

  const structureOptions = useMemo(() => {
    const fromUnits = [...new Set(units.map((u) => u.wing_name))].sort();
    if (wingNames.length) return wingNames;
    return fromUnits;
  }, [units, wingNames]);

  const typeOptions = useMemo(() => {
    const fromUnits = units.map((u) => u.unit_type);
    return mergeLookupOptions(masterUnitTypes, [...unitTypeNames, ...fromUnits]);
  }, [units, unitTypeNames, masterUnitTypes]);

  const categoryOptions = useMemo(() => {
    const fromUnits = units.map((u) => u.unit_category);
    return mergeLookupOptions(masterUnitCategories, fromUnits);
  }, [units, masterUnitCategories]);

  const availableUnitsForBlock = useMemo(
    () => units.filter((u) => isUnitAvailableForBooking(u.status)),
    [units]
  );

  const blockUnitOptions = useMemo(
    () =>
      availableUnitsForBlock.map(
        (u) => `${u.unit_code} — ${u.unit_type ?? '—'}`
      ),
    [availableUnitsForBlock]
  );

  const selectedBlockUnitLabel = useMemo(() => {
    const unit = availableUnitsForBlock.find((u) => u.id === blockUnitId);
    return unit ? `${unit.unit_code} — ${unit.unit_type ?? '—'}` : '';
  }, [availableUnitsForBlock, blockUnitId]);

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

  function openDetail(
    u: UnitRow,
    createBookingEligibility: 'available' | 'blocked' = 'available'
  ) {
    setDetailBookingEligibility(createBookingEligibility);
    setSelected(u);
    setDetailOpen(true);
  }

  if (loading && !project) {
    return <CrmInventoryPageSkeleton />;
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
          <h1 className="text-base font-semibold text-ds-gray-800">Inventory</h1>
          <p className="text-[11px] text-muted-foreground">
            {projectName || 'Select a project to view inventory'}
          </p>
        </div>
        {projects.length > 0 ? (
          <div className="min-w-[12rem] max-w-[min(100%,320px)]">
            <Label className={filterLabelClass}>Project</Label>
            <SearchableSelect
              value={
                projects.find((p) => p.id === inventoryProjectId)?.name ?? ''
              }
              onValueChange={(name) => {
                const next = projects.find((p) => p.name === name);
                if (next) selectInventoryProject(next.id);
              }}
              options={projects.map((p) => p.name)}
              placeholder="Select project…"
              searchPlaceholder="Search project…"
              className={cn(filterSelectClass, 'min-w-[12rem]')}
            />
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          'flex flex-wrap gap-0 rounded-lg px-4',
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
                ? 'border-ds-primary-500 font-semibold text-ds-primary-600'
                : 'font-normal text-ds-gray-500 hover:text-ds-gray-700'
            )}
          >
            {inventoryTabLabel(t)}
          </button>
        ))}
      </div>

      {tab === 'Inventory Info' && (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ds-primary-200 bg-ds-primary-50 px-4 py-2.5 text-[11px] text-ds-primary-600">
            <span>
              Inventory configuration is set during{' '}
              <strong>Project Creation</strong>. To change wings, floors, or
              density,{' '}
              <Link
                href="/crm/project"
                className="font-bold text-ds-primary-800 underline"
              >
                edit the project
              </Link>
              .
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <div className={cn('p-4', tabCardClass())}>
              <div className="mb-3 text-[11px] font-semibold text-ds-gray-800">
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
                      className="flex justify-between border-b border-ds-gray-100 py-1.5 text-[11px] last:border-0"
                    >
                      <span className="text-muted-foreground">{k}</span>
                      <span className="max-w-[60%] text-right font-medium text-ds-gray-800">
                        {v}
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <div>
                  {loading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <CrmInventoryKvRowSkeleton key={i} />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Could not load project.</p>
                  )}
                </div>
              )}
            </div>
            <div className={cn('p-4', tabCardClass())}>
              <div className="mb-3 text-[11px] font-semibold text-ds-gray-800">
                Live Inventory Summary
              </div>
              {UNIT_STATUS_CODES.map((k) => {
                const v = STATUS_LABEL[k] ?? k;
                return (
                  <div
                    key={k}
                    className="flex items-center gap-2.5 border-b border-ds-gray-100 py-1.5"
                  >
                    <div
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ background: STATUS_COLOR[k] }}
                    />
                    <span className="flex-1 text-[11px] text-muted-foreground">
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
              <div className="mt-2 flex justify-between border-t border-ds-gray-100 pt-2 text-xs font-bold text-ds-gray-800">
                <span>Total</span>
                <span>{units.length}</span>
              </div>
            </div>
          </div>
          <div className={cn('p-4', tabCardClass())}>
            <div className="mb-2 text-[11px] font-semibold text-ds-gray-800">
              Bulk unit import (CSV)
            </div>
            <p className="mb-2 text-[10px] leading-relaxed text-muted-foreground">
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
        </div>
      )}

      {tab === 'Grid View' && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-[10px] leading-snug text-ds-gray-600">
            <span className="inline-flex items-center gap-1 rounded-full bg-ds-success-100 px-2 py-0.5 text-[9px] font-bold text-ds-success-800">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ds-success-500" />
              Live
            </span>
            <span className="font-semibold text-ds-gray-800">Sales matrix: </span>
            filter by wing and floor; cells align to unit slots on each floor.
            Colours follow the legend; carpet/BUA and floor-rise + PLC roll into
            the list price shown on each cell.
          </div>
          <div
            className={cn(
              'flex flex-wrap items-end gap-3 px-4 py-3',
              tabCardClass()
            )}
          >
            <div className="min-w-[10rem] max-w-[220px]">
              <Label className={filterLabelClass}>Wing</Label>
              <SearchableSelect
                value={structFilter === 'All' ? 'All structures' : structFilter}
                onValueChange={(v) =>
                  setStructFilter(v === 'All structures' ? 'All' : v)
                }
                options={['All structures', ...structureOptions]}
                placeholder="All structures"
                searchPlaceholder="Search wing…"
                className={filterSelectClass}
              />
            </div>
            <div className="min-w-[10rem]">
              <Label className={filterLabelClass}>Floor</Label>
              <SearchableSelect
                value={
                  floorOptions.find((f) => f.value === floorFilter)?.label ??
                  'All Floors'
                }
                onValueChange={(label) => {
                  const opt = floorOptions.find((f) => f.label === label);
                  if (opt) setFloorFilter(opt.value);
                }}
                options={floorOptions.map((f) => f.label)}
                placeholder="All Floors"
                searchPlaceholder="Search floor…"
                className={filterSelectClass}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-[10px] leading-snug text-ds-gray-600">
          {UNIT_STATUS_CODES.map((k) => {
              const v = STATUS_LABEL[k] ?? k;
              return (
                <div key={k} className="flex items-center gap-1">
                  <div
                    className="h-3 w-3 rounded-sm"
                    style={{ background: STATUS_COLOR[k] }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {v} ({counts[k] ?? 0})
                  </span>
                </div>
              );
            })}
          </div>
          </div>

          
         

          <div className="flex flex-col gap-3 lg:flex-row">
            <div
              className={cn(
                'min-w-0 flex-1 overflow-x-auto p-4',
                tabCardClass()
              )}
            >
              {loading && filteredGrid.length === 0 ? (
                <CrmInventoryGridMatrixSkeleton floors={6} unitsPerFloor={5} />
              ) : null}
              {!loading || filteredGrid.length > 0
                ? uniqueWingsGrid.map((wing) => {
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
                    <div className="mb-2 inline-block rounded bg-ds-primary-50 px-2.5 py-1 text-[11px] font-bold text-ds-primary-600">
                      {wing}
                    </div>
                    <table className="border-collapse">
                      <thead>
                        <tr>
                          <th className="w-16 px-2 py-0.5 text-left text-[9px] font-semibold text-ds-gray-400">
                            Floor
                          </th>
                          {[...Array(wingMaxUnitsPerFloor)].map((_, i) => (
                            <th
                              key={i}
                              className="px-2 py-0.5 text-center text-[9px] font-semibold text-ds-gray-400"
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
                              <td className="px-2 py-1 align-middle text-[10px] font-medium text-muted-foreground">
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
                                        <div className="inline-flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted/80" />
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
              })
                : null}
              {!loading && uniqueWingsGrid.length === 0 ? (
                <p className="text-sm text-ds-gray-400">No units in this view.</p>
              ) : null}
            </div>

            {selected && tab === 'Grid View' ? (
              <div
                className={cn(
                  'w-full shrink-0 self-start p-4 lg:w-[280px]',
                  tabCardClass()
                )}
              >
                <div className="mb-3 flex justify-between">
                  <div>
                    <div className="text-xs font-bold text-ds-gray-800">
                      {selected.unit_code}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="text-ds-gray-400 hover:text-ds-gray-600"
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
                    className="flex justify-between border-b border-ds-gray-50 py-1 text-[11px]"
                  >
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium text-ds-gray-800">{v}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </>
      )}

      {tab === 'Unit List' && (
        <div className={cn('relative p-4', tabCardClass())}>
          <InventoryListTable
            units={units}
            structureOptions={structureOptions}
            typeOptions={typeOptions}
            loading={loading}
            onOpenDetail={openDetail}
            onEdit={setEditUnit}
            onRefresh={() => void load()}
            sorting={sorting}
            onSortingChange={onSortingChange}
          />
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
                    ? 'border-ds-primary-500 bg-ds-primary-50 font-semibold text-ds-primary-600'
                    : 'border-ds-gray-200 bg-card text-ds-gray-500'
                )}
              >
                {o}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <div className="flex w-20 flex-col gap-1">
              <div className="mb-1 text-center text-[9px] font-semibold text-ds-gray-400">
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
                      ? 'border-ds-primary-500 bg-ds-primary-50 font-bold text-ds-primary-600'
                      : 'border-ds-gray-200 bg-ds-gray-50 text-ds-gray-500'
                  )}
                >
                  {formatFloorChipLabel(f, undefined)}
                </button>
              ))}
            </div>

            <div className="min-w-0 flex-1 rounded-[10px] bg-muted p-5">
              <div className="mb-4 text-center text-xs font-semibold text-ds-gray-800">
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
                      const c = STATUS_COLOR[u.status] ?? 'var(--ds-gray-400)';
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => openDetail(u, 'blocked')}
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
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {u.unit_type ?? '—'}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {unitBillableAreaSqft(u) || u.area || '—'} sq.ft
                            billable
                          </div>
                          <div className="text-[10px] font-semibold text-ds-gray-700">
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
                <div className="flex w-9 shrink-0 items-center justify-center rounded bg-ds-gray-200">
                  <div
                    className="text-[8px] font-semibold tracking-wide text-ds-gray-400"
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
                      const c = STATUS_COLOR[u.status] ?? 'var(--ds-gray-400)';
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => openDetail(u, 'blocked')}
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
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {u.unit_type ?? '—'}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {unitBillableAreaSqft(u) || u.area || '—'} sq.ft
                            billable
                          </div>
                          <div className="text-[10px] font-semibold text-ds-gray-700">
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
                      <span className="text-[10px] text-muted-foreground">{v}</span>
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
            <div className="text-xs font-bold text-ds-gray-800">
              Interactive map (coming soon)
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Full MapLibre GL + 3D extrusions are not bundled yet. Prefer the{' '}
              <strong>Grid view</strong> tab for sales-ready inventory. To enable
              this tab, install <code className="text-ds-gray-700">maplibre-gl</code>{' '}
              and wire scene GeoJSON.
            </p>
            <div className="rounded-lg border border-dashed border-ds-warning-200 bg-ds-warning-50/80 p-2.5 text-[10px] text-ds-warning-900">
              Placeholder only — no live map layer in this build.
            </div>
            <div className="max-h-[280px] overflow-y-auto border-t border-ds-gray-100 pt-2">
              {[...new Set(units.map((u) => u.wing_name))]
                .sort()
                .map((wing) => (
                  <div key={wing} className="mb-2.5">
                    <div className="mb-1.5 text-[10px] font-bold text-ds-gray-700">
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
                                ? 'border-ds-primary-700 bg-ds-primary-50 text-ds-primary-700'
                                : 'border-border bg-card text-ds-gray-600'
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
              'flex min-h-[320px] items-center justify-center overflow-hidden border border-border shadow-sm lg:min-h-full',
              tabCardClass()
            )}
          >
            <div className="text-center text-sm text-ds-gray-400">
              Map viewport (3D)
            </div>
          </div>
        </div>
      )}

      {tab === 'Blocked Units' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {blockedUnits.length} unit(s) currently blocked
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="bg-ds-gray-600 text-white hover:bg-ds-gray-700"
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
                  <Label className="text-xs text-orange-900">Unit</Label>
                  <SearchableSelect
                    value={selectedBlockUnitLabel}
                    onValueChange={(label) => {
                      const unit = availableUnitsForBlock.find(
                        (u) =>
                          `${u.unit_code} — ${u.unit_type ?? '—'}` === label
                      );
                      setBlockUnitId(unit?.id ?? '');
                      blockValidation.touch('blockUnitId');
                    }}
                    options={blockUnitOptions}
                    placeholder="Select available unit…"
                    searchPlaceholder="Search unit…"
                    className={cn(filterSelectClass, 'min-w-[12rem]')}
                  />
                  <FormFieldError message={blockValidation.fieldError('blockUnitId')} />
                </div>
                <div className="min-w-[200px] flex-[3]">
                  <Label className="text-xs text-orange-900">Reason</Label>
                  <Select
                    value={blockReason === '' ? undefined : blockReason}
                    onValueChange={(v) => {
                      setBlockReason(v);
                      blockValidation.touch('blockReason');
                    }}
                  >
                    <SelectTrigger
                      className={cn(filterSelectClass, 'min-w-[12rem]')}
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

          <div className={cn('overflow-x-auto', tabCardClass())}>
            <table className="w-full min-w-xl border-collapse text-sm">
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
        projectId={selected?.project_id ?? inventoryProjectId}
        projectName={projectName}
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o);
          if (!o) setSelected(null);
        }}
        onCreateBooking={navigateToBookingForUnit}
        createBookingEligibility={detailBookingEligibility}
      />

      <UnitEditDrawer
        unit={editUnit}
        open={!!editUnit}
        onOpenChange={(o) => {
          if (!o) setEditUnit(null);
        }}
        onSaved={() => void load()}
        typeOptions={typeOptions}
        categoryOptions={categoryOptions}
      />
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<CrmInventoryPageSkeleton />}>
      <InventoryPageContent />
    </Suspense>
  );
}

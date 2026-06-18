'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useCrmProjectsContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import {
  defaultPossessionChecklist,
  mergePossessionChecklist,
  type PossessionWorkflowStage
} from '@/lib/possession/possession-trackers';
import { toast } from '@/lib/toast';
import { normalizeUnitStatusCode } from '../inventory/unit-status';
import { PossessionListTable, type PossessionListRow } from './possession-list-table';
import { PossessionCaseDialog } from './possession-case-dialog';

type UnitHandoverRow = {
  id: string;
  project_id: string;
  unit_code: string;
  status: string;
  projects: { name: string } | { name: string }[] | null;
};

type CaseRow = {
  id: string;
  project_id: string;
  unit_id: string;
  booking_id: string | null;
  workflow_stage: string;
  checklist: unknown;
  keys_handed_over_at: string | null;
};

type BookingJoin = {
  unit_id: string;
  customer_id: string;
  customers: { full_name: string } | { full_name: string }[] | null;
};

function unwrapJoin<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export default function PossessionHandoverPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { projects } = useCrmProjectsContext();
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
  const projectNameById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const [rows, setRows] = useState<PossessionListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeRow, setActiveRow] = useState<PossessionListRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    if (projectIds.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);

    const { data: units, error: uErr } = await supabase
      .from('units')
      .select('id, project_id, unit_code, status, projects(name)')
      .in('project_id', projectIds)
      .in('status', ['PRE_POSSESSION', 'POSSESSED'])
      .order('unit_code', { ascending: true });

    if (uErr) {
      toast.error({ title: 'Could not load units', description: uErr.message });
      setLoading(false);
      return;
    }

    const unitRows = (units ?? []) as UnitHandoverRow[];
    const unitIds = unitRows.map((u) => u.id);

    if (unitIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data: cases, error: cErr } = await supabase
      .from('possession_cases')
      .select(
        'id, project_id, unit_id, booking_id, workflow_stage, checklist, keys_handed_over_at'
      )
      .in('unit_id', unitIds);

    if (cErr) {
      toast.error({ title: 'Could not load possession cases', description: cErr.message });
      setLoading(false);
      return;
    }

    const caseByUnit = new Map<string, CaseRow>();
    for (const c of (cases ?? []) as CaseRow[]) {
      caseByUnit.set(c.unit_id, c);
    }

    const missingUnits = unitRows.filter((u) => !caseByUnit.has(u.id));
    if (missingUnits.length > 0) {
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, unit_id')
        .in('unit_id', missingUnits.map((u) => u.id))
        .neq('status', 'cancelled')
        .order('updated_at', { ascending: false });

      const bookingByUnit = new Map<string, string>();
      for (const b of bookings ?? []) {
        const uid = (b as { unit_id: string }).unit_id;
        if (!bookingByUnit.has(uid)) {
          bookingByUnit.set(uid, (b as { id: string }).id);
        }
      }

      const inserts = missingUnits.map((u) => ({
        project_id: u.project_id,
        unit_id: u.id,
        booking_id: bookingByUnit.get(u.id) ?? null,
        checklist: defaultPossessionChecklist()
      }));

      const { data: inserted, error: insErr } = await supabase
        .from('possession_cases')
        .insert(inserts)
        .select(
          'id, project_id, unit_id, booking_id, workflow_stage, checklist, keys_handed_over_at'
        );

      if (insErr) {
        toast.error({ title: 'Could not create possession cases', description: insErr.message });
        setLoading(false);
        return;
      }

      for (const c of (inserted ?? []) as CaseRow[]) {
        caseByUnit.set(c.unit_id, c);
      }
    }

    const bookingIds = [
      ...new Set(
        [...caseByUnit.values()]
          .map((c) => c.booking_id)
          .filter((id): id is string => Boolean(id))
      )
    ];

    const customerByUnit = new Map<string, string>();
    if (bookingIds.length > 0) {
      const { data: bookingRows } = await supabase
        .from('bookings')
        .select('unit_id, customers(full_name)')
        .in('id', bookingIds);

      for (const b of (bookingRows ?? []) as BookingJoin[]) {
        const name = unwrapJoin(b.customers)?.full_name ?? '—';
        customerByUnit.set(b.unit_id, name);
      }
    }

    if (customerByUnit.size < unitIds.length) {
      const { data: moreBookings } = await supabase
        .from('bookings')
        .select('unit_id, customers(full_name)')
        .in('unit_id', unitIds)
        .neq('status', 'cancelled')
        .order('updated_at', { ascending: false });

      for (const b of (moreBookings ?? []) as BookingJoin[]) {
        if (!customerByUnit.has(b.unit_id)) {
          customerByUnit.set(
            b.unit_id,
            unwrapJoin(b.customers)?.full_name ?? '—'
          );
        }
      }
    }

    const list: PossessionListRow[] = unitRows.map((u) => {
      const c = caseByUnit.get(u.id)!;
      const proj = unwrapJoin(u.projects);
      return {
        caseId: c.id,
        unitId: u.id,
        unitCode: u.unit_code,
        projectName: proj?.name ?? projectNameById.get(u.project_id) ?? '—',
        customerName: customerByUnit.get(u.id) ?? '—',
        unitStatus: u.status,
        workflowStage: (c.workflow_stage as PossessionWorkflowStage) ?? 'OC',
        checklist: mergePossessionChecklist(c.checklist),
        keysHandedOverAt: c.keys_handed_over_at,
        bookingId: c.booking_id
      };
    });

    list.sort((a, b) => {
      const aReady = normalizeUnitStatusCode(a.unitStatus) === 'PRE_POSSESSION';
      const bReady = normalizeUnitStatusCode(b.unitStatus) === 'PRE_POSSESSION';
      if (aReady !== bReady) return aReady ? -1 : 1;
      return a.unitCode.localeCompare(b.unitCode);
    });

    setRows(list);
    setLoading(false);
  }, [projectIds, projectNameById, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <Card className="border-ds-gray-200 p-4 sm:p-5">
        <div>
          <h2 className="text-sm font-semibold text-ds-gray-900">
            Possession &amp; handover
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ds-gray-600">
            Track snag lists, fit-out NOCs, meter applications, society formation,
            maintenance deposit, possession checklist, and key handover for units
            marked <strong className="font-medium text-ds-gray-800">Possession ready</strong>.
            When keys are handed to the customer, the unit moves to{' '}
            <strong className="font-medium text-ds-gray-800">Possession given</strong>.
          </p>
        </div>
        <PossessionListTable
          rows={rows}
          loading={loading}
          onManage={(row) => {
            setActiveRow(row);
            setDialogOpen(true);
          }}
        />
      </Card>

      <PossessionCaseDialog
        row={activeRow}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => void load()}
      />
    </div>
  );
}

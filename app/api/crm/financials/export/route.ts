import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProjectAccess } from '@/lib/authz';
import {
  buildLedgerCsv,
  buildReceiptsCsv,
  sanitizeFilenamePart,
  type LedgerExportRow,
  type ReceiptExportRow
} from '@/lib/financials-csv';
import {
  FINANCIALS_EXPORT_LEDGER_MAX_ROWS,
  FINANCIALS_EXPORT_RECEIPTS_MAX_ROWS
} from '@/lib/financials-export-spec';

const CSV_UTF8_BOM = '\uFEFF';

function fmtAmount(n: number | string | null | undefined): string {
  const x = typeof n === 'string' ? Number(n) : Number(n);
  if (!Number.isFinite(x)) return '0.00';
  return x.toFixed(2);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  return String(d).slice(0, 10);
}

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '';
  return String(d).replace('T', ' ').slice(0, 19);
}

function csvResponse(filename: string, body: string): NextResponse {
  return new NextResponse(CSV_UTF8_BOM + body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get('kind') || 'ledger';
  const projectId = request.nextUrl.searchParams.get('projectId');
  const supabase = await createSupabaseServerClient();
  const datePart = new Date().toISOString().slice(0, 10);

  let projectName = 'all-projects';
  if (projectId) {
    const gate = await requireProjectAccess(projectId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const { data: projectRow } = await supabase
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .maybeSingle();
    projectName = sanitizeFilenamePart((projectRow?.name as string) || projectId);
  }

  const { data: allProjects } = await supabase.from('projects').select('id,name');
  const projectNameById = new Map(
    (allProjects ?? []).map((p) => [p.id as string, String(p.name ?? '')])
  );

  if (kind === 'receipts') {
    let bookingsQuery = supabase.from('bookings').select('id,unit_id,customer_id,project_id');
    if (projectId) bookingsQuery = bookingsQuery.eq('project_id', projectId);
    const { data: bookings, error: bErr } = await bookingsQuery;
    if (bErr) {
      return NextResponse.json({ error: bErr.message }, { status: 500 });
    }
    const bookingList = (bookings ?? []) as Array<{
      id: string;
      unit_id: string;
      customer_id: string;
      project_id: string;
    }>;
    const bookingIds = bookingList.map((b) => b.id);
    if (bookingIds.length === 0) {
      return csvResponse(
        `buildcon-receipts-${projectName}-${datePart}.csv`,
        buildReceiptsCsv([])
      );
    }

    const [{ data: collections, error: cErr }, { data: schedules, error: sErr }] =
      await Promise.all([
        supabase
          .from('collections')
          .select(
            'id,booking_id,schedule_id,received_amount,received_at,mode,reference,created_at'
          )
          .in('booking_id', bookingIds)
          .order('created_at', { ascending: false })
          .limit(FINANCIALS_EXPORT_RECEIPTS_MAX_ROWS),
        supabase
          .from('payment_schedules')
          .select('id,booking_id,instalment_no,milestone')
          .in('booking_id', bookingIds)
      ]);
    if (cErr || sErr) {
      return NextResponse.json(
        { error: cErr?.message || sErr?.message },
        { status: 500 }
      );
    }

    const unitIds = [...new Set(bookingList.map((b) => b.unit_id))];
    const custIds = [...new Set(bookingList.map((b) => b.customer_id))];
    const [{ data: units }, { data: customers }] = await Promise.all([
      supabase.from('units').select('id,unit_code').in('id', unitIds),
      supabase.from('customers').select('id,full_name').in('id', custIds)
    ]);
    const unitById = new Map((units ?? []).map((u) => [u.id as string, String(u.unit_code ?? '')]));
    const custById = new Map(
      (customers ?? []).map((c) => [c.id as string, String(c.full_name ?? '')])
    );
    const bookingById = new Map(bookingList.map((b) => [b.id, b]));
    const schedById = new Map(
      (schedules ?? []).map((s) => [
        s.id as string,
        { instalment_no: Number(s.instalment_no), milestone: String(s.milestone ?? '') }
      ])
    );

    const rows: ReceiptExportRow[] = ((collections ?? []) as Array<Record<string, unknown>>).map(
      (c) => {
        const bid = c.booking_id as string;
        const b = bookingById.get(bid);
        const sid = (c.schedule_id as string | null) || '';
        const sch = sid ? schedById.get(sid) : undefined;
        const pid = b?.project_id ?? '';
        return {
          project_id: pid,
          project_name: projectNameById.get(pid) ?? '',
          collection_id: String(c.id),
          booking_id: bid,
          customer_name: b ? custById.get(b.customer_id) ?? '' : '',
          unit_code: b ? unitById.get(b.unit_id) ?? '' : '',
          schedule_id: sid,
          instalment_no: sch ? String(sch.instalment_no) : '',
          milestone: sch?.milestone ?? '',
          received_amount: fmtAmount(c.received_amount as number),
          received_at: fmtDate(c.received_at as string | null),
          mode: String(c.mode ?? ''),
          reference: String(c.reference ?? ''),
          created_at: fmtDateTime(c.created_at as string)
        };
      }
    );

    return csvResponse(
      `buildcon-receipts-${projectName}-${datePart}.csv`,
      buildReceiptsCsv(rows)
    );
  }

  if (kind !== 'ledger') {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  }

  let ledgerQuery = supabase
    .from('v_payment_schedule_outstanding')
    .select(
      'project_id,booking_id,customer_id,schedule_id,instalment_no,milestone,due_date,demand_amount,received_amount,outstanding_amount,is_overdue'
    )
    .order('booking_id', { ascending: true })
    .order('instalment_no', { ascending: true })
    .limit(FINANCIALS_EXPORT_LEDGER_MAX_ROWS);
  if (projectId) ledgerQuery = ledgerQuery.eq('project_id', projectId);
  const { data: vRows, error: vErr } = await ledgerQuery;
  if (vErr) {
    return NextResponse.json({ error: vErr.message }, { status: 500 });
  }

  const rowsRaw = (vRows ?? []) as Array<{
    project_id: string;
    booking_id: string;
    customer_id: string;
    schedule_id: string;
    instalment_no: number;
    milestone: string;
    due_date: string | null;
    demand_amount: number;
    received_amount: number;
    outstanding_amount: number;
    is_overdue: boolean;
  }>;

  const bookingIds = [...new Set(rowsRaw.map((r) => r.booking_id))];
  const customerIds = [...new Set(rowsRaw.map((r) => r.customer_id))];

  let bookings: { id: string; unit_id: string }[] = [];
  if (bookingIds.length) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id,unit_id')
      .in('id', bookingIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    bookings = (data ?? []) as { id: string; unit_id: string }[];
  }

  let customers: { id: string; full_name: string }[] = [];
  if (customerIds.length) {
    const { data, error } = await supabase
      .from('customers')
      .select('id,full_name')
      .in('id', customerIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    customers = (data ?? []) as { id: string; full_name: string }[];
  }

  const unitIds = [...new Set(bookings.map((b) => b.unit_id))];
  const { data: units } =
    unitIds.length > 0
      ? await supabase.from('units').select('id,unit_code').in('id', unitIds)
      : { data: [] };

  const unitById = new Map((units ?? []).map((u) => [u.id as string, String(u.unit_code ?? '')]));
  const custById = new Map(customers.map((c) => [c.id as string, String(c.full_name ?? '')]));
  const bookingUnitById = new Map(bookings.map((b) => [b.id as string, b.unit_id as string]));

  const ledgerRows: LedgerExportRow[] = rowsRaw.map((r) => {
    const uid = bookingUnitById.get(r.booking_id);
    return {
      project_id: r.project_id,
      project_name: projectNameById.get(r.project_id) ?? '',
      booking_id: r.booking_id,
      schedule_id: r.schedule_id ?? '',
      customer_name: custById.get(r.customer_id) ?? '',
      unit_code: uid ? unitById.get(uid) ?? '' : '',
      instalment_no: Number(r.instalment_no) || 0,
      milestone: r.milestone ?? '',
      due_date: fmtDate(r.due_date),
      demand_amount: fmtAmount(r.demand_amount),
      received_amount: fmtAmount(r.received_amount),
      outstanding_amount: fmtAmount(r.outstanding_amount),
      is_overdue: r.is_overdue ? 'true' : 'false'
    };
  });

  return csvResponse(
    `buildcon-ledger-${projectName}-${datePart}.csv`,
    buildLedgerCsv(ledgerRows)
  );
}

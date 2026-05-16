-- Negotiation budget approvals — DB-level audit trail for every request.
-- One row per request; admin decisions update the same row in place.

create table if not exists public.negotiation_approvals (
  id uuid primary key default gen_random_uuid(),
  sales_inquiry_id uuid not null references public.sales_inquiries (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete restrict,
  unit_id uuid references public.units (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,

  list_price numeric(14, 2),
  offered_price numeric(14, 2) not null,
  discount_pct numeric(6, 2),

  status text not null default 'Pending'
    check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),

  request_note text,
  decision_note text,

  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists negotiation_approvals_status_idx
  on public.negotiation_approvals (status, requested_at desc);

create index if not exists negotiation_approvals_inquiry_idx
  on public.negotiation_approvals (sales_inquiry_id, requested_at desc);

create index if not exists negotiation_approvals_project_idx
  on public.negotiation_approvals (project_id, status);

-- Only ONE pending approval per inquiry at a time (others must be decided/cancelled first).
create unique index if not exists negotiation_approvals_one_pending_per_inquiry
  on public.negotiation_approvals (sales_inquiry_id)
  where status = 'Pending';

-- Touch updated_at on row update.
create or replace function public.trg_negotiation_approvals_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists negotiation_approvals_set_updated_at on public.negotiation_approvals;
create trigger negotiation_approvals_set_updated_at
before update on public.negotiation_approvals
for each row
execute function public.trg_negotiation_approvals_set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.negotiation_approvals enable row level security;

-- Project members + super admins can read project-scoped approvals.
create policy "negotiation_approvals_select_project"
on public.negotiation_approvals
for select
using (public.has_project_access(project_id));

-- Project members can create approval requests for inquiries in their project.
create policy "negotiation_approvals_insert_project"
on public.negotiation_approvals
for insert
with check (
  public.has_project_access(project_id)
  and requested_by = auth.uid()
);

-- The requester can cancel their own Pending request; super admins can do anything.
create policy "negotiation_approvals_update_super_admin"
on public.negotiation_approvals
for update
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "negotiation_approvals_cancel_own_pending"
on public.negotiation_approvals
for update
using (
  status = 'Pending'
  and requested_by = auth.uid()
)
with check (
  status in ('Pending', 'Cancelled')
  and requested_by = auth.uid()
);

-- ─── Decision RPC (super admin only) ─────────────────────────────────────────
-- Updates the approval row AND mirrors the outcome into sales_inquiries.stage_data
-- so the inquiry pipeline UI stays in sync without an extra round-trip.

create or replace function public.decide_negotiation_approval(
  p_approval_id uuid,
  p_decision text,
  p_decision_note text default null
)
returns public.negotiation_approvals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.negotiation_approvals;
  v_status text;
  v_inq_stage_data jsonb;
  v_decision_label text;
begin
  if not public.is_super_admin() then
    raise exception 'Only super admins can decide negotiation approvals';
  end if;

  v_decision_label := lower(coalesce(p_decision, ''));
  if v_decision_label = 'approve' or v_decision_label = 'approved' then
    v_status := 'Approved';
  elsif v_decision_label = 'reject' or v_decision_label = 'rejected' then
    v_status := 'Rejected';
  else
    raise exception 'Decision must be approve or reject (got %)', p_decision;
  end if;

  update public.negotiation_approvals
  set
    status = v_status,
    decision_note = p_decision_note,
    decided_by = auth.uid(),
    decided_at = now()
  where id = p_approval_id
    and status = 'Pending'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Approval not found or already decided';
  end if;

  -- Mirror approval outcome into the inquiry's stage_data.negotiation block.
  select stage_data into v_inq_stage_data
  from public.sales_inquiries
  where id = v_row.sales_inquiry_id;

  if v_inq_stage_data is null then
    v_inq_stage_data := '{}'::jsonb;
  end if;

  v_inq_stage_data := jsonb_set(
    v_inq_stage_data,
    '{negotiation}',
    coalesce(v_inq_stage_data -> 'negotiation', '{}'::jsonb)
      || jsonb_build_object(
        'approval_status', lower(v_status),
        'approval_id', v_row.id,
        'offered_price', v_row.offered_price::text,
        'decision_note', coalesce(p_decision_note, ''),
        'decided_at', to_char(v_row.decided_at, 'YYYY-MM-DD"T"HH24:MI:SSOF')
      ),
    true
  );

  update public.sales_inquiries
  set stage_data = v_inq_stage_data
  where id = v_row.sales_inquiry_id;

  return v_row;
end;
$$;

grant execute on function public.decide_negotiation_approval(uuid, text, text)
  to authenticated;

-- Add stage_data JSONB column to sales_opportunities.
-- Stores per-stage form data captured through the 5-stage CRM pipeline wizard:
--   enquiry     → notes, follow_up_date
--   qualified   → budget_min, budget_max, financing, temperature, follow_up_date, notes
--   site_visit  → scheduled_at, status, outcome, notes
--   negotiation → offered_price, discount_pct, counter_offer, expected_close, notes
--   token       → amount, date, mode, reference, notes

alter table public.sales_opportunities
  add column if not exists stage_data jsonb not null default '{}'::jsonb;

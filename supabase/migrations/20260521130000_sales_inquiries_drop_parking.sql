-- Parking preferences live on the enquiry wizard / booking prefill only, not on sales_inquiries.

alter table public.sales_inquiries
  drop constraint if exists sales_inquiries_parking_required_chk;

alter table public.sales_inquiries
  drop column if exists parking_slots_available,
  drop column if exists parking_rate_snapshot,
  drop column if exists parking_required,
  drop column if exists parking_count;

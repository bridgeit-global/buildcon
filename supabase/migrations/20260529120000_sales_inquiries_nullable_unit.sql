-- Allow enquiries without a linked unit (Enquiry stage only).

alter table public.sales_inquiries
  alter column unit_id drop not null;

alter table public.sales_inquiries
  drop constraint if exists sales_inquiries_unit_id_fkey;

alter table public.sales_inquiries
  add constraint sales_inquiries_unit_id_fkey
  foreign key (unit_id) references public.units (id) on delete set null;

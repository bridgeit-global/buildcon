-- Linked buyers can read their own quotation rows (portal).

create policy "quotations_select_own_customer"
on public.quotations
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.linked_customer_id is not null
      and p.linked_customer_id = quotations.customer_id
  )
);

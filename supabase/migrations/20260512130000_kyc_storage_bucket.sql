-- Private bucket for customer KYC files. Paths: customer/<customer_id>/<doc_type>/<uuid>.<ext>
insert into storage.buckets (id, name, public, file_size_limit)
values ('kyc', 'kyc', false, 52428800)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

-- Authenticated staff (CRM) can manage objects in the kyc bucket.
-- INSERT + SELECT + UPDATE required for upsert/replace per Supabase storage docs.
create policy "kyc_objects_insert_authenticated"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'kyc');

create policy "kyc_objects_select_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'kyc');

create policy "kyc_objects_update_authenticated"
on storage.objects
for update
to authenticated
using (bucket_id = 'kyc')
with check (bucket_id = 'kyc');

create policy "kyc_objects_delete_authenticated"
on storage.objects
for delete
to authenticated
using (bucket_id = 'kyc');

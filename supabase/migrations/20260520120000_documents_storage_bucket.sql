-- Private bucket for CRM-generated documents (HTML/PDF). Paths: documents/project/<project_id>/...
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

create policy "documents_objects_insert_authenticated"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'documents');

create policy "documents_objects_select_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'documents');

create policy "documents_objects_update_authenticated"
on storage.objects
for update
to authenticated
using (bucket_id = 'documents')
with check (bucket_id = 'documents');

create policy "documents_objects_delete_authenticated"
on storage.objects
for delete
to authenticated
using (bucket_id = 'documents');

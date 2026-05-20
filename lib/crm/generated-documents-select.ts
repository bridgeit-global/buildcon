/** Shared Supabase select for `generated_documents` list + joins. */
export const GENERATED_DOCUMENTS_LIST_SELECT =
  'id,project_id,booking_id,customer_id,template_id,storage_path,generated_at,projects(name),bookings(id,units(unit_code)),customers(full_name)';

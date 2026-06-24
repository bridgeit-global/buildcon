import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isProjectNameTaken,
  PROJECT_NAME_DUPLICATE_ERROR,
  type ProjectNameRow
} from './project-name';

export async function loadProjectNameRows(
  admin: SupabaseClient
): Promise<{ rows: ProjectNameRow[]; error: string | null }> {
  const { data, error } = await admin.from('projects').select('id, name');
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as ProjectNameRow[], error: null };
}

export async function assertProjectNameAvailable(
  admin: SupabaseClient,
  name: string,
  excludeProjectId?: string
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return 'Project name is required.';

  const { rows, error } = await loadProjectNameRows(admin);
  if (error) return error;

  if (isProjectNameTaken(trimmed, rows, excludeProjectId)) {
    return PROJECT_NAME_DUPLICATE_ERROR;
  }
  return null;
}

export function isProjectNameUniqueViolation(error: { code?: string } | null) {
  return error?.code === '23505';
}

export const PROJECT_NAME_DUPLICATE_ERROR =
  'A project with this name already exists.';

export type ProjectNameRow = { id?: string; name: string };

/** Case-insensitive key for comparing project names. */
export function normalizeProjectNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function isProjectNameTaken(
  name: string,
  existing: Iterable<ProjectNameRow>,
  excludeProjectId?: string
): boolean {
  const key = normalizeProjectNameKey(name);
  if (!key) return false;
  for (const row of existing) {
    if (excludeProjectId && row.id === excludeProjectId) continue;
    if (normalizeProjectNameKey(row.name) === key) return true;
  }
  return false;
}

export function projectNameDuplicateError(
  name: string,
  existing: Iterable<ProjectNameRow>,
  excludeProjectId?: string
): string | null {
  return isProjectNameTaken(name, existing, excludeProjectId)
    ? PROJECT_NAME_DUPLICATE_ERROR
    : null;
}

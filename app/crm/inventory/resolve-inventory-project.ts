export function resolveInventoryProjectId(
  projects: { id: string }[],
  urlProjectId: string | null
): string {
  if (urlProjectId && projects.some((p) => p.id === urlProjectId)) {
    return urlProjectId;
  }
  return projects[0]?.id ?? '';
}

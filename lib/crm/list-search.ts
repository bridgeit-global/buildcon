/** Escape `%`, `_`, and `\` for SQL ILIKE patterns. */
export function escapeIlike(term: string): string {
  return term.replace(/[%_\\]/g, '\\$&');
}

function quotePostgrestValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Build a PostgREST `.or()` filter string for case-insensitive search across text columns. */
export function buildIlikeOrFilter(columns: string[], term: string): string {
  const pattern = quotePostgrestValue(`%${escapeIlike(term)}%`);
  return columns.map((col) => `${col}.ilike.${pattern}`).join(',');
}

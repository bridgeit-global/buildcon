export function unitDisplayName(u: { unit_code: string; wing_name: string }) {
  return `${u.unit_code} · ${u.wing_name}`;
}

export function inquiryReference(id: string) {
  const compact = id.replace(/-/g, '');
  return `INQ-${compact.slice(0, 10).toUpperCase()}`;
}

export function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export function embedList<T>(x: T | T[] | null | undefined): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

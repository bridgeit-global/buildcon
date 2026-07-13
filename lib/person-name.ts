export type PersonNameParts = {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
};

/** Join non-empty name parts with single spaces. */
export function formatFullName(parts: PersonNameParts): string {
  return [parts.first_name, parts.middle_name, parts.last_name]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Best-effort split of a display name:
 * first token → first_name, last token → last_name, middle tokens → middle_name.
 * Single token → first_name only (last_name empty).
 */
export function splitFullName(fullName: string | null | undefined): PersonNameParts {
  const tokens = String(fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    return { first_name: '', middle_name: '', last_name: '' };
  }
  if (tokens.length === 1) {
    return { first_name: tokens[0], middle_name: '', last_name: '' };
  }
  if (tokens.length === 2) {
    return { first_name: tokens[0], middle_name: '', last_name: tokens[1] };
  }
  return {
    first_name: tokens[0],
    middle_name: tokens.slice(1, -1).join(' '),
    last_name: tokens[tokens.length - 1]
  };
}

/** Fields to write when the UI only has a single full_name string. */
export function namePartsFromFullName(fullName: string): PersonNameParts & {
  full_name: string;
} {
  const parts = splitFullName(fullName);
  const full_name = formatFullName(parts) || String(fullName ?? '').trim();
  return { ...parts, full_name };
}

export const PROJECT_TYPES = [
  'Redevelopment',
  'Greenfield',
  'Mixed Use',
  'Development',
  'Ready'
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

/** Indian FY start year (April–March) for a calendar date. */
export function indianFyStartYear(date = new Date()): number {
  const month = date.getMonth();
  const year = date.getFullYear();
  return month >= 3 ? year : year - 1;
}

/** e.g. 2026 → "2026-27" */
export function formatIndianFy(startYear: number): string {
  const end = (startYear + 1) % 100;
  return `${startYear}-${String(end).padStart(2, '0')}`;
}

export function parseIndianFyStartYear(fy: string): number | null {
  const match = /^(\d{4})-\d{2}$/.exec(fy.trim());
  return match ? Number(match[1]) : null;
}

export function isReadyProjectType(projectType: string): boolean {
  return projectType.trim().toLowerCase() === 'ready';
}

type ProjectFyOptionsConfig = {
  /** How many years before/after the current FY to offer. */
  span?: number;
  now?: Date;
  /** Keep an existing value visible when editing, even if out of range. */
  includeFy?: string | null;
};

/**
 * Ready projects: past and current FY (completed inventory).
 * Other types: current and future FY (projects under development).
 */
export function projectFyOptions(
  projectType: string,
  config: ProjectFyOptionsConfig = {}
): string[] {
  const span = config.span ?? 15;
  const current = indianFyStartYear(config.now);
  const ready = isReadyProjectType(projectType);

  const startYears: number[] = [];
  if (ready) {
    for (let y = current; y >= current - span; y--) {
      startYears.push(y);
    }
  } else {
    for (let y = current; y <= current + span; y++) {
      startYears.push(y);
    }
  }

  const options = startYears.map(formatIndianFy);
  const include = (config.includeFy ?? '').trim();
  if (include && !options.includes(include)) {
    options.push(include);
    options.sort(
      (a, b) => (parseIndianFyStartYear(b) ?? 0) - (parseIndianFyStartYear(a) ?? 0)
    );
  }
  return options;
}

export function defaultProjectFy(projectType: string, now?: Date): string {
  void projectType;
  return formatIndianFy(indianFyStartYear(now));
}

/** Snap FY to a valid option for the project type, or the default. */
export function coerceProjectFy(
  projectType: string,
  fy: string,
  config: Omit<ProjectFyOptionsConfig, 'includeFy'> = {}
): string {
  const trimmed = fy.trim();
  const options = projectFyOptions(projectType, config);
  if (trimmed && options.includes(trimmed)) return trimmed;
  return defaultProjectFy(projectType, config.now);
}

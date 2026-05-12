export type CrmProject = {
  id: string;
  name: string;
  location: string | null;
  type: string;
  status: string;
  fy: string | null;
  rera_no: string | null;
  floors_per_wing: number;
  units_per_floor: number;
  base_rate: number | null;
  min_rate: number | null;
  max_rate: number | null;
  parking_slots: number | null;
  parking_rate: number | null;
};

/** Extended fields returned by GET `/api/crm/projects` for list cards */
export type CrmProjectListExtras = {
  wing_count: number;
  unit_count: number;
  member_count: number;
  member_preview: Array<{
    user_id: string;
    name: string | null;
    initials: string;
  }>;
};

export type CrmProjectListItem = CrmProject & CrmProjectListExtras;


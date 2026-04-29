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
};


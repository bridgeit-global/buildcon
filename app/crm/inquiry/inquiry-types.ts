export type CustomerEmbed = {
  full_name: string;
  phone: string | null;
  email: string | null;
};
export type ProjectEmbed = { name: string };
export type UnitEmbed = {
  unit_code: string;
  wing_name: string;
  project_id?: string;
  projects?: ProjectEmbed | ProjectEmbed[] | null;
};
export type ProfileEmbed = { name: string | null };
export type BrokerEmbed = { full_name: string };

/** Per-stage form payloads stored in `sales_inquiries.stage_data`. */
export type InquiryStageData = {
  enquiry?: Record<string, unknown>;
  qualified?: Record<string, unknown>;
  site_visit?: Record<string, unknown>;
  negotiation?: Record<string, unknown>;
  token?: Record<string, unknown>;
};

export type InquiryRowDb = {
  id: string;
  project_id: string;
  projects?: ProjectEmbed | ProjectEmbed[] | null;
  created_at: string;
  updated_at?: string;
  lead_source: string;
  broker_id: string | null;
  brokers: BrokerEmbed | BrokerEmbed[] | null;
  interested_in: string | null;
  notes: string | null;
  funnel_stage: string;
  assigned_to: string | null;
  stage_data: InquiryStageData | Record<string, unknown> | null;
  customer_id: string;
  unit_id: string;
  customers: CustomerEmbed | CustomerEmbed[] | null;
  units: UnitEmbed | UnitEmbed[] | null;
  profiles: ProfileEmbed | ProfileEmbed[] | null;
};

export type UnitRow = {
  id: string;
  project_id: string;
  /** Joined from `projects.name` when listing units for enquiry. */
  project_name?: string | null;
  unit_code: string;
  wing_name: string;
  floor: number;
  unit_no: number;
  unit_type: string | null;
  area: number | null;
  carpet_area: number | null;
  bua_area: number | null;
  rate: number | null;
  floor_rise_charge: number | null;
  plc_charge: number | null;
  parking_slots_included?: number | null;
  status: string;
};

export type UnitLabelRow = Pick<
  UnitRow,
  'id' | 'unit_code' | 'wing_name' | 'project_id'
> & {
  project_name?: string | null;
};

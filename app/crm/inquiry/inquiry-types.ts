import type { OpportunityRow } from './inquiry-pipeline-dialog';

export type CustomerEmbed = {
  full_name: string;
  phone: string | null;
  email: string | null;
};
export type UnitEmbed = { unit_code: string; wing_name: string };
export type ProfileEmbed = { name: string | null };
export type BrokerEmbed = { full_name: string };

export type InquiryRowDb = {
  id: string;
  created_at: string;
  lead_source: string;
  broker_id: string | null;
  brokers: BrokerEmbed | BrokerEmbed[] | null;
  interested_in: string | null;
  parking_required: string;
  parking_count: string;
  parking_slots_available: number | null;
  parking_rate_snapshot: number | null;
  notes: string | null;
  customer_id: string;
  unit_id: string;
  customers: CustomerEmbed | CustomerEmbed[] | null;
  units: UnitEmbed | UnitEmbed[] | null;
  profiles: ProfileEmbed | ProfileEmbed[] | null;
  sales_opportunities?: OpportunityRow | OpportunityRow[] | null;
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
  status: string;
};

export type UnitLabelRow = Pick<UnitRow, 'id' | 'unit_code' | 'wing_name'>;

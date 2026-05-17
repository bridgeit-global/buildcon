export const BOOKING_WORKFLOW_STAGES = [
  'token',
  'application',
  'allotment',
  'confirmation'
] as const;

export type BookingWorkflowStage = (typeof BOOKING_WORKFLOW_STAGES)[number];

export const BOOKING_WORKFLOW_LABEL: Record<BookingWorkflowStage, string> = {
  token: 'Token',
  application: 'Application form',
  allotment: 'Allotment',
  confirmation: 'Booking confirmation'
};

export type CoBuyerStored = {
  customer_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  relationship?: string | null;
};

export type BookingTokenStageData = {
  amount?: string;
  date?: string;
  mode?: string;
  reference?: string;
  notes?: string;
  recorded_at?: string;
};

export type BookingApplicationStageData = {
  submitted_at?: string;
  occupation?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  pin?: string;
  notes?: string;
};

export type BookingAllotmentStageData = {
  allotment_date?: string;
  allotment_letter_ref?: string;
  notes?: string;
  confirmed_at?: string;
};

export type BookingConfirmationStageData = {
  confirmed_at?: string;
  confirmed_by?: string;
  notes?: string;
};

export type BookingStageData = {
  token?: BookingTokenStageData;
  application?: BookingApplicationStageData;
  allotment?: BookingAllotmentStageData;
  confirmation?: BookingConfirmationStageData;
};

export type BookingListRow = {
  id: string;
  project_id: string;
  unit_id: string;
  customer_id: string;
  sales_inquiry_id: string | null;
  created_at: string;
  updated_at: string | null;
  stage: string;
  workflow_stage: BookingWorkflowStage;
  status: 'active' | 'cancelled';
  payment_mode: string | null;
  loan_bank: string | null;
  booking_amount: number | null;
  co_buyers: CoBuyerStored[] | null;
  units:
    | {
        unit_code: string;
        wing_name: string;
        floor: number;
        unit_type: string | null;
        status: string;
      }
    | {
        unit_code: string;
        wing_name: string;
        floor: number;
        unit_type: string | null;
        status: string;
      }[]
    | null;
  customers:
    | { full_name: string; phone: string | null; pan_number?: string | null }
    | { full_name: string; phone: string | null; pan_number?: string | null }[]
    | null;
};

export type BookingDetailRow = BookingListRow & {
  payment_detail: Record<string, string> | null;
  stage_data: BookingStageData;
};

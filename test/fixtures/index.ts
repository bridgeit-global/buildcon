export function makeProject(overrides: Partial<{ id: string; name: string }> = {}) {
  return {
    id: 'proj-1',
    name: 'Test Project',
    ...overrides
  };
}

export function makeUnit(
  overrides: Partial<{
    id: string;
    project_id: string;
    unit_code: string;
    status: string;
    area: number;
    rate: number;
    wing_name: string;
    floor: number;
    unit_no: number;
  }> = {}
) {
  return {
    id: 'unit-1',
    project_id: 'proj-1',
    unit_code: 'A-101',
    wing_name: 'A',
    floor: 1,
    unit_no: 1,
    status: 'AVAILABLE',
    area: 1000,
    rate: 5000,
    ...overrides
  };
}

export function makeBooking(
  overrides: Partial<{
    id: string;
    project_id: string;
    unit_id: string;
    stage: string;
    booking_amount: number;
  }> = {}
) {
  return {
    id: 'booking-1',
    project_id: 'proj-1',
    unit_id: 'unit-1',
    stage: 'TOKEN',
    booking_amount: 100000,
    ...overrides
  };
}

export function makeInquiry(
  overrides: Partial<{
    id: string;
    project_id: string;
    unit_id: string;
    funnel_stage: string;
  }> = {}
) {
  return {
    id: 'inquiry-1',
    project_id: 'proj-1',
    unit_id: 'unit-1',
    funnel_stage: 'NEGOTIATION',
    stage_data: {},
    ...overrides
  };
}

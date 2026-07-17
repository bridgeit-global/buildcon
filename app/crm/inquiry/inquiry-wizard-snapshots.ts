import { datetimeLocalValueNextWeek } from '@/lib/date-input-value';
import { DEFAULT_COUNTRY_DIAL_CODE_OPTION } from '@/lib/phone/country-dial-codes';

export type WizardStep1Snapshot = {
  customerName: string;
  phone: string;
  phoneCountry: string;
  email: string;
  leadSource: string;
  leadSourceOther: string;
  brokerId: string;
  interestedIn: string;
  preferredLocation: string;
  preferredWing: string;
  budgetMin: string;
  budgetMax: string;
  parkingRequired: string;
  parkingCount: string;
  followUpDate: string;
  notes: string;
};

export type WizardStep2Snapshot = {
  selectedUnitId: string;
  projectId: string;
};

export type WizardStep3Snapshot = {
  visitInterest: string;
  followUpDate: string;
  notes: string;
};

export type WizardStepId = 1 | 2 | 3;

export type WizardSavedSnapshots = {
  1: WizardStep1Snapshot;
  2: WizardStep2Snapshot;
  3: WizardStep3Snapshot;
};

export function emptyWizardStep1Snapshot(): WizardStep1Snapshot {
  return {
    customerName: '',
    phone: '',
    phoneCountry: DEFAULT_COUNTRY_DIAL_CODE_OPTION,
    email: '',
    leadSource: 'Direct',
    leadSourceOther: '',
    brokerId: '',
    interestedIn: '',
    preferredLocation: '',
    preferredWing: '',
    budgetMin: '',
    budgetMax: '',
    parkingRequired: 'No',
    parkingCount: '1',
    followUpDate: datetimeLocalValueNextWeek(),
    notes: ''
  };
}

export function emptyWizardStep2Snapshot(): WizardStep2Snapshot {
  return { selectedUnitId: '', projectId: '' };
}

export function emptyWizardStep3Snapshot(): WizardStep3Snapshot {
  return {
    visitInterest: '',
    followUpDate: datetimeLocalValueNextWeek(),
    notes: ''
  };
}

export function emptyWizardSavedSnapshots(): WizardSavedSnapshots {
  return {
    1: emptyWizardStep1Snapshot(),
    2: emptyWizardStep2Snapshot(),
    3: emptyWizardStep3Snapshot()
  };
}

export function wizardSnapshotsEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function wizardStepLabel(step: WizardStepId): string {
  if (step === 1) return 'Enquiry';
  if (step === 2) return 'Qualified';
  return 'Visit site';
}

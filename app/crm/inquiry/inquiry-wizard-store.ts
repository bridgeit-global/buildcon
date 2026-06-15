'use client';

import { create } from 'zustand';
import type { InquiryPipelineUiStage } from './inquiry-funnel-stages';
import type { InquiryWizardUiDrafts, InquiryWizardUiDirty } from './inquiry-wizard-ui';
import {
  emptyWizardSavedSnapshots,
  wizardSnapshotsEqual,
  type WizardSavedSnapshots,
  type WizardStep1Snapshot,
  type WizardStep2Snapshot,
  type WizardStep3Snapshot,
  type WizardStepId
} from './inquiry-wizard-snapshots';

export type WizardNavPending = {
  onProceed: () => void | Promise<void>;
  resolve: (proceeded: boolean) => void;
};

export type WizardNavigationRequest =
  | { type: 'step'; step: WizardStepId }
  | { type: 'pipeline'; stage: InquiryPipelineUiStage };

type InquiryWizardStore = {
  savedSnapshots: WizardSavedSnapshots;
  draftSnapshots: WizardSavedSnapshots;
  stepDirty: Record<WizardStepId, boolean>;
  navConfirmOpen: boolean;
  navConfirmSaving: boolean;
  navPending: WizardNavPending | null;
  navigationRequest: WizardNavigationRequest | null;
  navigationResolver: ((proceeded: boolean) => void) | null;

  syncDraftStep1: (snapshot: WizardStep1Snapshot) => void;
  syncDraftStep2: (snapshot: WizardStep2Snapshot) => void;
  syncDraftStep3: (snapshot: WizardStep3Snapshot) => void;
  hydrateSnapshots: (snapshots: WizardSavedSnapshots) => void;
  /** Restore saved baseline plus optional persisted drafts/dirty flags from DB. */
  hydrateWithPersistedDrafts: (params: {
    saved: WizardSavedSnapshots;
    drafts?: InquiryWizardUiDrafts;
    dirty?: InquiryWizardUiDirty;
  }) => void;
  markStepSaved: (step: WizardStepId) => void;
  resetWizardState: () => void;

  openNavConfirm: (pending: WizardNavPending) => void;
  takeNavPending: () => WizardNavPending | null;
  setNavConfirmOpen: (open: boolean) => void;
  setNavConfirmSaving: (saving: boolean) => void;

  requestNavigation: (request: WizardNavigationRequest) => Promise<boolean>;
  takeNavigationRequest: () => {
    request: WizardNavigationRequest;
    resolve: (proceeded: boolean) => void;
  } | null;
};

function computeStepDirty(
  savedSnapshots: WizardSavedSnapshots,
  draftSnapshots: WizardSavedSnapshots
): Record<WizardStepId, boolean> {
  return {
    1: !wizardSnapshotsEqual(draftSnapshots[1], savedSnapshots[1]),
    2: !wizardSnapshotsEqual(draftSnapshots[2], savedSnapshots[2]),
    3: !wizardSnapshotsEqual(draftSnapshots[3], savedSnapshots[3])
  };
}

const emptySnapshots = emptyWizardSavedSnapshots();

export const useInquiryWizardStore = create<InquiryWizardStore>((set, get) => ({
  savedSnapshots: emptySnapshots,
  draftSnapshots: emptySnapshots,
  stepDirty: { 1: false, 2: false, 3: false },
  navConfirmOpen: false,
  navConfirmSaving: false,
  navPending: null,
  navigationRequest: null,
  navigationResolver: null,

  syncDraftStep1: (snapshot) =>
    set((state) => {
      const draftSnapshots = { ...state.draftSnapshots, 1: snapshot };
      return {
        draftSnapshots,
        stepDirty: computeStepDirty(state.savedSnapshots, draftSnapshots)
      };
    }),

  syncDraftStep2: (snapshot) =>
    set((state) => {
      const draftSnapshots = { ...state.draftSnapshots, 2: snapshot };
      return {
        draftSnapshots,
        stepDirty: computeStepDirty(state.savedSnapshots, draftSnapshots)
      };
    }),

  syncDraftStep3: (snapshot) =>
    set((state) => {
      const draftSnapshots = { ...state.draftSnapshots, 3: snapshot };
      return {
        draftSnapshots,
        stepDirty: computeStepDirty(state.savedSnapshots, draftSnapshots)
      };
    }),

  hydrateSnapshots: (snapshots) =>
    set({
      savedSnapshots: snapshots,
      draftSnapshots: snapshots,
      stepDirty: { 1: false, 2: false, 3: false }
    }),

  hydrateWithPersistedDrafts: ({ saved, drafts, dirty }) =>
    set(() => {
      const draftSnapshots: WizardSavedSnapshots = {
        1: drafts?.['1'] ?? saved[1],
        2: drafts?.['2'] ?? saved[2],
        3: drafts?.['3'] ?? saved[3]
      };
      const stepDirty: Record<WizardStepId, boolean> = {
        1: dirty?.['1'] ?? !wizardSnapshotsEqual(draftSnapshots[1], saved[1]),
        2: dirty?.['2'] ?? !wizardSnapshotsEqual(draftSnapshots[2], saved[2]),
        3: dirty?.['3'] ?? !wizardSnapshotsEqual(draftSnapshots[3], saved[3])
      };
      return { savedSnapshots: saved, draftSnapshots, stepDirty };
    }),

  markStepSaved: (step) =>
    set((state) => {
      const savedSnapshots = { ...state.savedSnapshots };
      if (step === 1) {
        savedSnapshots[1] = state.draftSnapshots[1];
      } else if (step === 2) {
        savedSnapshots[1] = state.draftSnapshots[1];
        savedSnapshots[2] = state.draftSnapshots[2];
      } else {
        savedSnapshots[3] = state.draftSnapshots[3];
      }
      return {
        savedSnapshots,
        stepDirty: computeStepDirty(savedSnapshots, state.draftSnapshots)
      };
    }),

  resetWizardState: () =>
    set({
      savedSnapshots: emptySnapshots,
      draftSnapshots: emptySnapshots,
      stepDirty: { 1: false, 2: false, 3: false },
      navConfirmOpen: false,
      navConfirmSaving: false,
      navPending: null,
      navigationRequest: null,
      navigationResolver: null
    }),

  openNavConfirm: (pending) => set({ navConfirmOpen: true, navPending: pending }),

  takeNavPending: () => {
    const pending = get().navPending;
    set({ navPending: null });
    return pending;
  },

  setNavConfirmOpen: (navConfirmOpen) =>
    set((state) =>
      navConfirmOpen
        ? { navConfirmOpen }
        : { navConfirmOpen, navConfirmSaving: false, navPending: null }
    ),

  setNavConfirmSaving: (navConfirmSaving) => set({ navConfirmSaving }),

  requestNavigation: (request) =>
    new Promise((resolve) => {
      set({ navigationRequest: request, navigationResolver: resolve });
    }),

  takeNavigationRequest: () => {
    const request = get().navigationRequest;
    const resolve = get().navigationResolver;
    if (!request || !resolve) return null;
    set({ navigationRequest: null, navigationResolver: null });
    return { request, resolve };
  }
}));

export function selectWizardStepDirty(state: InquiryWizardStore): Record<WizardStepId, boolean> {
  return state.stepDirty;
}

export function selectWizardSavedSnapshots(state: InquiryWizardStore): WizardSavedSnapshots {
  return state.savedSnapshots;
}

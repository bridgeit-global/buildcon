'use client';

import { create } from 'zustand';
import type { InquiryPipelineUiStage } from '@/app/crm/inquiry/inquiry-funnel-stages';
import type { InquiryWizardUiDrafts } from '@/app/crm/inquiry/inquiry-wizard-ui';
import {
  emptyWizardSavedSnapshots,
  wizardSnapshotsEqual,
  type WizardSavedSnapshots,
  type WizardStep1Snapshot,
  type WizardStep2Snapshot,
  type WizardStep3Snapshot,
  type WizardStepId
} from '@/app/crm/inquiry/inquiry-wizard-snapshots';

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
  hasUnsavedChanges: boolean;
  navConfirmOpen: boolean;
  navConfirmSaving: boolean;
  navPending: WizardNavPending | null;
  navigationRequest: WizardNavigationRequest | null;
  navigationResolver: ((proceeded: boolean) => void) | null;

  syncDraftStep1: (snapshot: WizardStep1Snapshot) => void;
  syncDraftStep2: (snapshot: WizardStep2Snapshot) => void;
  syncDraftStep3: (snapshot: WizardStep3Snapshot) => void;
  hydrateSnapshots: (snapshots: WizardSavedSnapshots) => void;
  /** Restore saved baseline plus optional persisted drafts from DB. */
  hydrateWithPersistedDrafts: (params: {
    saved: WizardSavedSnapshots;
    drafts?: InquiryWizardUiDrafts;
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

export function isWizardStepUnsaved(
  step: WizardStepId,
  savedSnapshots: WizardSavedSnapshots,
  draftSnapshots: WizardSavedSnapshots
): boolean {
  return !wizardSnapshotsEqual(draftSnapshots[step], savedSnapshots[step]);
}

function computeHasUnsavedChanges(
  savedSnapshots: WizardSavedSnapshots,
  draftSnapshots: WizardSavedSnapshots
): boolean {
  return (
    isWizardStepUnsaved(1, savedSnapshots, draftSnapshots) ||
    isWizardStepUnsaved(2, savedSnapshots, draftSnapshots) ||
    isWizardStepUnsaved(3, savedSnapshots, draftSnapshots)
  );
}

const emptySnapshots = emptyWizardSavedSnapshots();

export const useInquiryWizardStore = create<InquiryWizardStore>((set, get) => ({
  savedSnapshots: emptySnapshots,
  draftSnapshots: emptySnapshots,
  hasUnsavedChanges: false,
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
        hasUnsavedChanges: computeHasUnsavedChanges(
          state.savedSnapshots,
          draftSnapshots
        )
      };
    }),

  syncDraftStep2: (snapshot) =>
    set((state) => {
      const draftSnapshots = { ...state.draftSnapshots, 2: snapshot };
      return {
        draftSnapshots,
        hasUnsavedChanges: computeHasUnsavedChanges(
          state.savedSnapshots,
          draftSnapshots
        )
      };
    }),

  syncDraftStep3: (snapshot) =>
    set((state) => {
      const draftSnapshots = { ...state.draftSnapshots, 3: snapshot };
      return {
        draftSnapshots,
        hasUnsavedChanges: computeHasUnsavedChanges(
          state.savedSnapshots,
          draftSnapshots
        )
      };
    }),

  hydrateSnapshots: (snapshots) =>
    set({
      savedSnapshots: snapshots,
      draftSnapshots: snapshots,
      hasUnsavedChanges: false
    }),

  hydrateWithPersistedDrafts: ({ saved, drafts }) =>
    set(() => {
      const draftSnapshots: WizardSavedSnapshots = {
        1: drafts?.['1'] ?? saved[1],
        2: drafts?.['2'] ?? saved[2],
        3: drafts?.['3'] ?? saved[3]
      };
      return {
        savedSnapshots: saved,
        draftSnapshots,
        hasUnsavedChanges: computeHasUnsavedChanges(saved, draftSnapshots)
      };
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
        hasUnsavedChanges: computeHasUnsavedChanges(
          savedSnapshots,
          state.draftSnapshots
        )
      };
    }),

  resetWizardState: () =>
    set({
      savedSnapshots: emptySnapshots,
      draftSnapshots: emptySnapshots,
      hasUnsavedChanges: false,
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

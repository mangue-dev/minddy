"use client";

import { createContext, createElement, useContext, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "mangue-ui";
import { useAuth } from "./auth-context";
import { useProjects } from "./projects-context";
import { useHomeSummaryQuery } from "./use-home-summary-query";
import { resolveCyclePrefs } from "./cycle-prefs";
import { useAnalytics } from "./use-analytics";
import {
  ONBOARDING_CURRENT_VERSION,
  ONBOARDING_DISMISSED_META_KEY,
  ONBOARDING_STARTED_META_KEY,
  ONBOARDING_STEPS_META_KEY,
  ONBOARDING_VERSION_META_KEY,
  readAcknowledgedSteps,
  resolveOnboardingState,
  withAcknowledgedStep,
  type OnboardingState,
  type OnboardingStepId,
} from "./onboarding";

export interface UseOnboardingResult extends OnboardingState {
  loading: boolean;
  /** Keep the completion message visible until the user closes it. */
  finalScreen: boolean;
  showChecklist: boolean;
  acknowledgeStep: (step: OnboardingStepId) => Promise<void>;
  finish: () => Promise<void>;
  dismiss: () => Promise<void>;
}

export function useOnboarding(): UseOnboardingResult {
  const { user, updateUserMetadata } = useAuth();
  const { projects, loading: projectsLoading } = useProjects();

  const { counts, loading: summaryLoading } = useHomeSummaryQuery();
  const { track, setPersonProperties } = useAnalytics();

  const [pendingSteps, setPendingSteps] = useState<OnboardingStepId[]>([]);
  const [pendingDismiss, setPendingDismiss] = useState(false);
  const [pendingStart, setPendingStart] = useState(false);

  const meta = user?.user_metadata as Record<string, unknown> | undefined;

  const effectiveMeta = useMemo(() => {
    if (pendingSteps.length === 0 && !pendingDismiss && !pendingStart) {
      return meta ?? null;
    }
    const patch: Record<string, unknown> = { ...meta };
    if (pendingStart) patch[ONBOARDING_STEPS_META_KEY] = [...readAcknowledgedSteps(meta)];
    for (const step of pendingSteps) {
      patch[ONBOARDING_STEPS_META_KEY] = withAcknowledgedStep(patch, step);
    }
    if (pendingSteps.length > 0 || pendingStart) patch[ONBOARDING_VERSION_META_KEY] = ONBOARDING_CURRENT_VERSION;
    if (pendingDismiss) patch[ONBOARDING_DISMISSED_META_KEY] = true;
    if (pendingStart) patch[ONBOARDING_STARTED_META_KEY] = true;
    return patch;
  }, [meta, pendingSteps, pendingDismiss, pendingStart]);

  const state = useMemo(
    () =>
      resolveOnboardingState({
        meta: effectiveMeta,
        projectCount: projects.length,
        issueCount: counts.total,
        cyclesEnabled: resolveCyclePrefs(effectiveMeta).enabled,
      }),
    [effectiveMeta, projects.length, counts.total],
  );

  const loading = !user || projectsLoading || summaryLoading;

  // Stamp eligibility before a project or issue can make the account look established.
  const stampedRef = useRef(false);
  useEffect(() => {
    if (loading || !state.needsStartStamp || stampedRef.current) return;
    stampedRef.current = true;
    setPendingStart(true);
    void updateUserMetadata({
      [ONBOARDING_STARTED_META_KEY]: true,
      [ONBOARDING_VERSION_META_KEY]: ONBOARDING_CURRENT_VERSION,
      [ONBOARDING_STEPS_META_KEY]: [...readAcknowledgedSteps(meta)],
    }).catch(() => {
      stampedRef.current = false;
      setPendingStart(false);
    });
  }, [loading, state.needsStartStamp, updateUserMetadata, meta]);

  const seenStepsRef = useRef<Set<OnboardingStepId>>(new Set());
  useEffect(() => {
    if (loading || !state.visible || !state.currentStepId) return;
    const step = state.currentStepId;
    if (seenStepsRef.current.has(step)) return;
    seenStepsRef.current.add(step);
    if (seenStepsRef.current.size === 1) {
      track("onboarding_viewed", {
        current_step: step,
        completed_count: state.completedCount,
      });
    }
    track("onboarding_step_viewed", {
      step,
      step_number: state.currentStepNumber,
    });
  }, [
    loading,
    state.visible,
    state.currentStepId,
    state.currentStepNumber,
    state.completedCount,
    track,
  ]);

  const completionSentRef = useRef(false);
  useEffect(() => {
    if (loading || !state.eligible || !state.allComplete || completionSentRef.current) return;
    completionSentRef.current = true;
    track("onboarding_completed", { steps_acknowledged: state.completedCount });
    setPersonProperties(undefined, { onboarding_completed_at: new Date().toISOString() });
  }, [loading, state.eligible, state.allComplete, state.completedCount, track, setPersonProperties]);

  const wasVisibleRef = useRef(false);
  const [finalScreen, setFinalScreen] = useState(false);
  useEffect(() => {
    if (loading) return;
    if (state.visible) {
      setFinalScreen(false);
      wasVisibleRef.current = true;
      return;
    }
    if (wasVisibleRef.current && state.allComplete && !state.dismissed) {
      setFinalScreen(true);
    }
  }, [loading, state.visible, state.allComplete, state.dismissed]);

  const finish = useCallback(async () => {
    setFinalScreen(false);
    wasVisibleRef.current = false;
    if (!user) return;

    try {
      await updateUserMetadata({ [ONBOARDING_DISMISSED_META_KEY]: true });
    } catch {
      // Completed progress remains persisted even if closing the checklist fails.
    }
  }, [user, updateUserMetadata]);

  const acknowledgeStep = useCallback(
    async (step: OnboardingStepId) => {
      if (!user) return;
      track("onboarding_step_acknowledged", { step });
      setPendingSteps((prev) => (prev.includes(step) ? prev : [...prev, step]));
      try {
        await updateUserMetadata({
          [ONBOARDING_VERSION_META_KEY]: ONBOARDING_CURRENT_VERSION,
          [ONBOARDING_STEPS_META_KEY]: withAcknowledgedStep(
            effectiveMeta,
            step,
          ),
        });
      } catch (e) {
        setPendingSteps((prev) => prev.filter((s) => s !== step));
        toast.error((e as Error).message);
      }
    },
    [user, updateUserMetadata, track, effectiveMeta],
  );

  const dismiss = useCallback(async () => {
    setFinalScreen(false);
    if (!user) return;
    track("onboarding_dismissed", {
      last_step: state.currentStepId ?? "none",
      completed_count: state.completedCount,
    });
    setPendingDismiss(true);
    try {
      await updateUserMetadata({ [ONBOARDING_DISMISSED_META_KEY]: true });
    } catch (e) {
      setPendingDismiss(false);
      toast.error((e as Error).message);
    }
  }, [user, updateUserMetadata, track, state.currentStepId, state.completedCount]);

  return {
    ...state,
    loading,
    finalScreen,
    showChecklist: !loading && (state.visible || finalScreen),
    acknowledgeStep,
    finish,
    dismiss,
  };
}

const OnboardingContext = createContext<UseOnboardingResult | null>(null);

/** One account tracker shared by desktop navigation and the mobile menu. */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const onboarding = useOnboarding();
  return createElement(OnboardingContext.Provider, { value: onboarding }, children);
}

export function useOnboardingChecklist(): UseOnboardingResult {
  const onboarding = useContext(OnboardingContext);
  if (!onboarding) throw new Error("useOnboardingChecklist must be used within OnboardingProvider");
  return onboarding;
}

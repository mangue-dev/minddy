"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "mangue-ui";
import { useAuth } from "./auth-context";
import { useProjects } from "./projects-context";
import { useHomeSummaryQuery } from "./use-home-summary-query";
import { useAiKeysQuery } from "./use-ai-keys-query";
import { resolveCyclePrefs } from "./cycle-prefs";
import { useAnalytics } from "./use-analytics";
import {
  ONBOARDING_DISMISSED_META_KEY,
  ONBOARDING_STARTED_META_KEY,
  ONBOARDING_STEPS_META_KEY,
  resolveOnboardingState,
  withAcknowledgedStep,
  type OnboardingState,
  type OnboardingStepId,
} from "./onboarding";

export interface UseOnboardingResult extends OnboardingState {
  /** The signals are not yet known — the home does not display anything. */
  loading: boolean;
  /** Last step completed before the user's eyes: the card remains,
 * and shows its end word. Closes on `finish`. */
  finalScreen: boolean;
  /** What the home needs to know to mount the card: the steps, or
 * the end screen that follows them. */
  showCard: boolean;
  /** Marks a step completed (“Continue”, “Finish”). */
  acknowledgeStep: (step: OnboardingStepId) => Promise<void>;
  /** Closes the end word — onboarding will not return. */
  finish: () => Promise<void>;
  /** “Pass onboarding” — definitive. */
  dismiss: () => Promise<void>;
}

/**
 * Onboarding seen by the home (MIN-74): the real signals of the app (projects,
 * tickets, cycles) merged with the acknowledgments stored in `user_metadata`.
 *
 * The writes are OPTIMISTIC: `updateUserMetadata` goes back and forth
 * GoTrue, one step can't wait for this to move forward. Acknowledgments en
 * vol are superimposed on the read metadata, and removed if the write fails.
 */
export function useOnboarding(): UseOnboardingResult {
  const { user, updateUserMetadata } = useAuth();
  const { projects, loading: projectsLoading } = useProjects();
  // MIN-89: only the NUMBER of tickets is used here. It comes from the SQL counter of
  // /api/me/summary — the home no longer has to download the complete aggregated board.
  const { counts, loading: summaryLoading } = useHomeSummaryQuery();
  const { track, setPersonProperties } = useAnalytics();

  const [pendingSteps, setPendingSteps] = useState<OnboardingStepId[]>([]);
  const [pendingDismiss, setPendingDismiss] = useState(false);
  const [pendingStart, setPendingStart] = useState(false);

  const meta = user?.user_metadata as Record<string, unknown> | undefined;

  /**
 * The "key" step (MIN-149) is checked on real data, so it is necessary to read
 * the keys of the account - but ONLY when the onboarding can be displayed.
 * The two conditions are calculated without this reading (this is what makes the
 * safeguard possible): the account has not passed onboarding, and it is either
 * already entered, or still blank. The signals are expected before
 * concluding “blank”, otherwise the request would leave for everyone while it takes
 * to render.
 */
  const signalsReady = !!user && !projectsLoading && !summaryLoading;
  const onboardingPossible =
    signalsReady &&
    meta?.[ONBOARDING_DISMISSED_META_KEY] !== true &&
    (meta?.[ONBOARDING_STARTED_META_KEY] === true ||
      (projects.length === 0 && counts.total === 0));
  const { keys, loading: keysLoading } = useAiKeysQuery({ enabled: onboardingPossible });

  const effectiveMeta = useMemo(() => {
    if (pendingSteps.length === 0 && !pendingDismiss && !pendingStart) {
      return meta ?? null;
    }
    const patch: Record<string, unknown> = { ...meta };
    for (const step of pendingSteps) {
      patch[ONBOARDING_STEPS_META_KEY] = withAcknowledgedStep(patch, step);
    }
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
        hasAiKey: keys.length > 0,
        // Source of truth for cycles: account metadata, not the board.
        // `GET /api/me/summary` only reflects them — builds on it
        // make it wait for a refetch before the step is checked.
        cyclesEnabled: resolveCyclePrefs(effectiveMeta).enabled,
      }),
    [effectiveMeta, projects.length, counts.total, keys.length],
  );

  const loading = !user || projectsLoading || summaryLoading || keysLoading;

  /**
 * Engraves the onboarding entry on the account, only once, as soon as the
 * card is displayed for an account that is still empty. Without this mark, creating the
 * project and ticket would make the account "installed" (`blankAccount` false)
 * and cause it to drop out of its own onboarding just before the MCP step.
 */
  const stampedRef = useRef(false);
  useEffect(() => {
    if (loading || !state.needsStartStamp || stampedRef.current) return;
    stampedRef.current = true;
    setPendingStart(true);
    void updateUserMetadata({ [ONBOARDING_STARTED_META_KEY]: true }).catch(() => {
      // Silent: this is a background write that the user does not have
      // requested. The next renderer will try again.
      stampedRef.current = false;
      setPendingStart(false);
    });
  }, [loading, state.needsStartStamp, updateUserMetadata]);

  /**
 * Activation funnel (MIN-78). The CURRENT step seen is the product's most valuable event: it tells where new accounts drop off. Issued only once per step per session — without the guardrail,
 * each rendering of the home would send one.
 */
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

  /** Completed onboarding: account milestone, not just an event. */
  const completionSentRef = useRef(false);
  useEffect(() => {
    if (loading || !state.eligible || !state.allComplete || completionSentRef.current) return;
    completionSentRef.current = true;
    track("onboarding_completed", { steps_acknowledged: state.completedCount });
    setPersonProperties(undefined, { onboarding_completed_at: new Date().toISOString() });
  }, [loading, state.eligible, state.allComplete, state.completedCount, track, setPersonProperties]);

  /**
 * END WORD. The last step taken drops `visible` — the card
 * would disappear at the precise moment when there is something to say. We retain
 * therefore the TRANSITION, before the eyes of whoever causes it: the card was
 * displayed, it is no longer so because everything is done.
 *
 * It is a session state, not metadata: the only moment when it counts
 * is that of the click. A page reload at this precise moment returns the
 * home to normal — which is precisely what the screen announces.
 */
  const wasVisibleRef = useRef(false);
  const [finalScreen, setFinalScreen] = useState(false);
  useEffect(() => {
    if (loading) return;
    if (state.visible) {
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
    // Same key as “Skip onboarding”: everything is done, it no longer needs to be
    // take nothing back home. The completion event has already started
    // par l'effet ci-dessus — inutile d'ajouter un `onboarding_dismissed` qui
    // would say the opposite of what happened.
    try {
      await updateUserMetadata({ [ONBOARDING_DISMISSED_META_KEY]: true });
    } catch {
      // Silent: onboarding is finished, home has already been returned. The worst
      // case is an end word revised on the next passage — not an error to
      // montrer.
    }
  }, [user, updateUserMetadata]);

  const acknowledgeStep = useCallback(
    async (step: OnboardingStepId) => {
      if (!user) return;
      track("onboarding_step_acknowledged", { step });
      setPendingSteps((prev) => (prev.includes(step) ? prev : [...prev, step]));
      try {
        await updateUserMetadata({
          [ONBOARDING_STEPS_META_KEY]: withAcknowledgedStep(
            user.user_metadata as Record<string, unknown> | undefined,
            step,
          ),
        });
      } catch (e) {
        setPendingSteps((prev) => prev.filter((s) => s !== step));
        toast.error((e as Error).message);
      }
    },
    [user, updateUserMetadata, track],
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
    // Without account resolved or signals loaded, `visible` would be worth `true` by
    // default (0 project, 0 ticket) and would flash the onboarding on the home
    // a well-established account.
    loading,
    finalScreen,
    showCard: state.visible || finalScreen,
    acknowledgeStep,
    finish,
    dismiss,
  };
}

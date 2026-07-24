"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "mangue-ui";
import { useAuth } from "./auth-context";
import { useProjects } from "./projects-context";
import { useGlobalBoardQuery } from "./use-global-board-query";
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
  /** Les signaux ne sont pas encore connus — la home n'affiche rien. */
  loading: boolean;
  /** Marque une étape franchie (« Continuer », « Terminer »). */
  acknowledgeStep: (step: OnboardingStepId) => Promise<void>;
  /** « Passer l'onboarding » — définitif. */
  dismiss: () => Promise<void>;
}

/**
 * L'onboarding vu par la home (MIN-74) : les signaux réels de l'app (projets,
 * tickets, cycles) fusionnés aux acquittements stockés dans `user_metadata`.
 *
 * Les écritures sont OPTIMISTES : `updateUserMetadata` fait un aller-retour
 * GoTrue, une étape ne peut pas attendre ça pour avancer. Les acquittements en
 * vol sont superposés aux métadonnées lues, et retirés si l'écriture échoue.
 */
export function useOnboarding(): UseOnboardingResult {
  const { user, updateUserMetadata } = useAuth();
  const { projects, loading: projectsLoading } = useProjects();
  const { issues, loading: boardLoading } = useGlobalBoardQuery();
  const { track, setPersonProperties } = useAnalytics();

  const [pendingSteps, setPendingSteps] = useState<OnboardingStepId[]>([]);
  const [pendingDismiss, setPendingDismiss] = useState(false);
  const [pendingStart, setPendingStart] = useState(false);

  const meta = user?.user_metadata as Record<string, unknown> | undefined;

  const effectiveMeta = useMemo(() => {
    if (pendingSteps.length === 0 && !pendingDismiss && !pendingStart) {
      return meta ?? null;
    }
    const patch: Record<string, unknown> = { ...(meta ?? {}) };
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
        issueCount: issues.length,
        // Source de vérité des cycles : les métadonnées du compte, pas le board.
        // `GET /api/me/board` ne fait que les refléter — s'appuyer sur lui
        // ferait attendre un refetch avant que l'étape se coche.
        cyclesEnabled: resolveCyclePrefs(effectiveMeta).enabled,
      }),
    [effectiveMeta, projects.length, issues.length],
  );

  const loading = !user || projectsLoading || boardLoading;

  /**
   * Grave l'entrée en onboarding sur le compte, une seule fois, dès que la
   * carte s'affiche pour un compte encore vierge. Sans cette marque, créer le
   * projet et le ticket rendrait le compte « installé » (`blankAccount` faux)
   * et le ferait décrocher de son propre onboarding juste avant l'étape MCP.
   */
  const stampedRef = useRef(false);
  useEffect(() => {
    if (loading || !state.needsStartStamp || stampedRef.current) return;
    stampedRef.current = true;
    setPendingStart(true);
    void updateUserMetadata({ [ONBOARDING_STARTED_META_KEY]: true }).catch(() => {
      // Silencieux : c'est une écriture d'arrière-plan que l'utilisateur n'a pas
      // demandée. Le rendu suivant réessaiera.
      stampedRef.current = false;
      setPendingStart(false);
    });
  }, [loading, state.needsStartStamp, updateUserMetadata]);

  /**
   * Entonnoir d'activation (MIN-78). L'étape COURANTE vue est l'événement le
   * plus précieux du produit : c'est lui qui dit où les nouveaux comptes
   * décrochent. Émis une seule fois par étape et par session — sans le garde-fou,
   * chaque rendu de la home en enverrait un.
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

  /** Onboarding bouclé : jalon de compte, pas seulement un événement. */
  const completionSentRef = useRef(false);
  useEffect(() => {
    if (loading || !state.eligible || !state.allComplete || completionSentRef.current) return;
    completionSentRef.current = true;
    track("onboarding_completed", { steps_acknowledged: state.completedCount });
    setPersonProperties(undefined, { onboarding_completed_at: new Date().toISOString() });
  }, [loading, state.eligible, state.allComplete, state.completedCount, track, setPersonProperties]);

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
    // Sans compte résolu ni signaux chargés, `visible` vaudrait `true` par
    // défaut (0 projet, 0 ticket) et ferait clignoter l'onboarding sur la home
    // d'un compte bien installé.
    loading,
    acknowledgeStep,
    dismiss,
  };
}

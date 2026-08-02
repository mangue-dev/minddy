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
  /** Les signaux ne sont pas encore connus — la home n'affiche rien. */
  loading: boolean;
  /** Dernière étape franchie sous les yeux de l'utilisateur : la carte reste,
   *  et montre son mot de fin. Se ferme sur `finish`. */
  finalScreen: boolean;
  /** Ce que la home a besoin de savoir pour monter la carte : les étapes, ou
   *  l'écran de fin qui les suit. */
  showCard: boolean;
  /** Marque une étape franchie (« Continuer », « Terminer »). */
  acknowledgeStep: (step: OnboardingStepId) => Promise<void>;
  /** Ferme le mot de fin — l'onboarding ne reviendra pas. */
  finish: () => Promise<void>;
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
  // MIN-89 : seul le NOMBRE de tickets sert ici. Il vient du compteur SQL de
  // /api/me/summary — la home n'a plus à télécharger le board agrégé complet.
  const { counts, loading: summaryLoading } = useHomeSummaryQuery();
  const { track, setPersonProperties } = useAnalytics();

  const [pendingSteps, setPendingSteps] = useState<OnboardingStepId[]>([]);
  const [pendingDismiss, setPendingDismiss] = useState(false);
  const [pendingStart, setPendingStart] = useState(false);

  const meta = user?.user_metadata as Record<string, unknown> | undefined;

  /**
   * L'étape « clé » (MIN-149) se coche sur une donnée réelle, donc il faut lire
   * les clés du compte — mais UNIQUEMENT quand l'onboarding peut s'afficher.
   * Les deux conditions se calculent sans cette lecture (c'est ce qui rend le
   * garde-fou possible) : le compte n'a pas passé l'onboarding, et il est soit
   * déjà entré dedans, soit encore vierge. Les signaux sont attendus avant de
   * conclure « vierge », sinon la requête partirait pour tout le monde le temps
   * d'un rendu.
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
        issueCount: counts.total,
        hasAiKey: keys.length > 0,
        // Source de vérité des cycles : les métadonnées du compte, pas le board.
        // `GET /api/me/summary` ne fait que les refléter — s'appuyer sur lui
        // ferait attendre un refetch avant que l'étape se coche.
        cyclesEnabled: resolveCyclePrefs(effectiveMeta).enabled,
      }),
    [effectiveMeta, projects.length, counts.total, keys.length],
  );

  const loading = !user || projectsLoading || summaryLoading || keysLoading;

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

  /**
   * MOT DE FIN. La dernière étape franchie fait tomber `visible` — la carte
   * disparaîtrait au moment précis où il y a quelque chose à dire. On retient
   * donc la TRANSITION, sous les yeux de qui la provoque : la carte était
   * affichée, elle ne l'est plus parce que tout est fait.
   *
   * C'est un état de session, pas une métadonnée : le seul moment où il compte
   * est celui du clic. Un rechargement de page à cet instant précis rend la
   * home normale — ce qui est justement ce que l'écran annonce.
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
    // Même clé que « Passer l'onboarding » : tout est fait, il ne doit plus
    // rien reprendre à la home. L'événement de complétion, lui, est déjà parti
    // par l'effet ci-dessus — inutile d'ajouter un `onboarding_dismissed` qui
    // dirait le contraire de ce qui s'est passé.
    try {
      await updateUserMetadata({ [ONBOARDING_DISMISSED_META_KEY]: true });
    } catch {
      // Silencieux : l'onboarding est fini, la home est déjà rendue. Le pire
      // cas est un mot de fin revu au prochain passage — pas une erreur à
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
    // Sans compte résolu ni signaux chargés, `visible` vaudrait `true` par
    // défaut (0 projet, 0 ticket) et ferait clignoter l'onboarding sur la home
    // d'un compte bien installé.
    loading,
    finalScreen,
    showCard: state.visible || finalScreen,
    acknowledgeStep,
    finish,
    dismiss,
  };
}

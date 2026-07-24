"use client";

import { useCallback, useMemo } from "react";
import { usePostHog } from "posthog-js/react";
import { onAnalyticsReady, trackEvent } from "./analytics";
import type { AnalyticsEventName, AnalyticsPropsFor } from "./analytics-events";

/**
 * Le point d'entrée UNIQUE des événements analytics côté client (MIN-78).
 *
 * `track` est générique sur le catalogue : un nom inventé ou une prop hors
 * contrat est une erreur de COMPILATION, pas un événement silencieusement perdu.
 * L'allowlist runtime reste en filet (un `as any` quelque part, du code
 * dynamique) et la sanitisation garantit qu'aucune valeur non primitive ni
 * aucun texte trop long ne parte.
 *
 * Toutes les méthodes sont sûres quand PostHog n'est pas initialisé (pas de
 * clé, hôte local, consentement refusé) : `usePostHog()` renvoie alors un client
 * inerte et les appels ne font rien.
 */
export function useAnalytics() {
  const posthog = usePostHog();

  // Délègue à `trackEvent` : une seule implémentation (catalogue + allowlist +
  // sanitisation) partagée avec le code hors React. Le client visé est le même
  // singleton que celui fourni au provider.
  const track = useCallback(
    <E extends AnalyticsEventName>(event: E, props?: AnalyticsPropsFor<E>) =>
      trackEvent(event, props),
    []
  );

  // ── État (identité, groupe, propriétés) ─────────────────────────────────
  // Ces appels sont DIFFÉRÉS jusqu'à l'init de PostHog via `onAnalyticsReady`.
  // Sans ça ils arrivaient trop tôt et se perdaient : Supabase émet
  // `INITIAL_SESSION` dès le montage, alors que l'init attend que le navigateur
  // soit inactif — l'utilisateur restait donc anonyme toute la session.

  /** Rattache les événements suivants à un compte (après connexion). */
  const identify = useCallback(
    (userId: string, traits?: Record<string, unknown>, traitsOnce?: Record<string, unknown>) => {
      onAnalyticsReady(() => posthog?.identify(userId, traits, traitsOnce));
    },
    [posthog]
  );

  /** Déconnexion : repart d'une identité anonyme neuve. */
  const reset = useCallback(() => {
    onAnalyticsReady(() => posthog?.reset());
  }, [posthog]);

  /**
   * Analytics de groupe — associe les événements suivants à un projet, pour
   * pouvoir découper les entonnoirs et la rétention par projet. `resetGroups`
   * coupe l'association (sortie du projet / déconnexion).
   */
  const group = useCallback(
    (groupType: string, groupKey: string, props?: Record<string, unknown>) => {
      onAnalyticsReady(() => posthog?.group(groupType, groupKey, props));
    },
    [posthog]
  );
  const resetGroups = useCallback(() => {
    onAnalyticsReady(() => posthog?.resetGroups());
  }, [posthog]);

  /**
   * Projet courant attaché en PROPRIÉTÉ à tous les événements suivants.
   *
   * Doublon volontaire du groupe : l'analytics de groupe est un add-on PAYANT
   * chez PostHog, alors qu'une propriété d'événement est gratuite et se découpe
   * avec un simple « breakdown ». Sans ça, tant qu'on ne souscrit pas, la
   * dimension projet serait présente dans les données mais inexploitable.
   *
   * Le groupe reste posé en parallèle : il ne coûte rien tant que l'add-on
   * n'est pas activé (la facturation démarre à la souscription, pas à l'envoi),
   * et le jour où il le serait, tout est déjà en place.
   */
  const setProjectContext = useCallback(
    (projectId: string | null) => {
      onAnalyticsReady(() => {
        if (projectId) posthog?.register({ project_id: projectId });
        else posthog?.unregister("project_id");
      });
    },
    [posthog]
  );

  /**
   * Propriétés de personne aux jalons d'activation (`first_issue_at`,
   * `mcp_connected`…). Passe par l'API native plutôt que par `track({ $set })`
   * car le sanitizer rejette les clés préfixées par `$`.
   */
  const setPersonProperties = useCallback(
    (set?: Record<string, unknown>, setOnce?: Record<string, unknown>) => {
      onAnalyticsReady(() => posthog?.setPersonProperties(set, setOnce));
    },
    [posthog]
  );

  return useMemo(
    () => ({
      track,
      identify,
      reset,
      group,
      resetGroups,
      setProjectContext,
      setPersonProperties,
    }),
    [track, identify, reset, group, resetGroups, setProjectContext, setPersonProperties]
  );
}

import posthog from "posthog-js";
import {
  sanitizeAnalyticsEventName,
  sanitizeAnalyticsProps,
} from "./analytics-sanitize";
import {
  ALLOWED_ANALYTICS_EVENTS,
  type AnalyticsEventName,
  type AnalyticsPropsFor,
} from "./analytics-events";

/**
 * Émission d'un événement analytics HORS composant React (MIN-78).
 *
 * `useAnalytics()` couvre les composants ; beaucoup d'actions intéressantes
 * vivent en revanche dans la couche API (`lib/*-api.ts`) ou dans un store
 * zustand — du code sans hooks. `posthog-js` étant un singleton (c'est le même
 * client que celui passé au provider), on peut le viser directement, avec
 * exactement les mêmes garanties : catalogue typé, allowlist runtime,
 * sanitisation des props.
 *
 * Sans effet si PostHog n'est pas initialisé (pas de clé, hôte local, refus
 * cookies) ou si l'appel vient du serveur — les routes serveur passent par
 * `lib/server/posthog.ts`.
 */
/**
 * PostHog est-il initialisé ? (MIN-78)
 *
 * L'init est DIFFÉRÉE (`requestIdleCallback`, jusqu'à 800 ms), or l'identité
 * arrive AVANT : Supabase émet `INITIAL_SESSION` dès le montage, et le projet
 * courant est connu dès la première URL. Sans file d'attente, ces appels
 * partaient sur un client non initialisé et étaient perdus — l'utilisateur
 * restait anonyme toute la session, et plus aucun entonnoir par compte n'était
 * calculable.
 *
 * On distingue donc deux natures d'appel :
 *   - les ÉVÉNEMENTS (`trackEvent`) sont abandonnés s'ils précèdent l'init.
 *     C'est le coût assumé du chargement différé, et rejouer un événement
 *     passé fausserait son horodatage ;
 *   - l'ÉTAT (identité, groupe, propriétés de personne) est REJOUÉ à l'init.
 *     Ce n'est pas un événement daté mais un contexte : l'appliquer avec
 *     quelques centaines de millisecondes de retard est exact, le perdre ne
 *     l'est pas.
 */
let analyticsReady = false;
const readyWaiters = new Set<() => void>();

/** Appelé par le provider une fois `posthog.init()` passé. */
export function markAnalyticsReady(): void {
  if (analyticsReady) return;
  analyticsReady = true;
  // Copie avant itération : un callback peut en enregistrer un autre.
  for (const cb of [...readyWaiters]) {
    readyWaiters.delete(cb);
    cb();
  }
}

/**
 * Exécute `cb` dès que PostHog est prêt — immédiatement s'il l'est déjà.
 * Renvoie une fonction d'annulation (à appeler au démontage).
 */
export function onAnalyticsReady(cb: () => void): () => void {
  if (analyticsReady) {
    cb();
    return () => {};
  }
  readyWaiters.add(cb);
  return () => readyWaiters.delete(cb);
}

export function trackEvent<E extends AnalyticsEventName>(
  event: E,
  props?: AnalyticsPropsFor<E>
): void {
  if (typeof window === "undefined") return;
  // `__loaded` évite d'empiler des événements dans un client jamais initialisé
  // (l'init est différée : voir components/posthog-provider.tsx).
  if (!posthog.__loaded) return;
  const safeEvent = sanitizeAnalyticsEventName(event);
  if (!safeEvent || !ALLOWED_ANALYTICS_EVENTS.has(safeEvent as AnalyticsEventName)) return;
  posthog.capture(
    safeEvent,
    sanitizeAnalyticsProps(props as Record<string, unknown> | undefined)
  );
}

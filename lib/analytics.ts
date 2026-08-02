import type { PostHog } from "posthog-js";
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
 * Le client PostHog, une fois chargé (MIN-94).
 *
 * `posthog-js` pèse 227 Ko non compressés : l'importer statiquement ici le
 * mettait dans le bundle initial de TOUTES les pages publiques, via la chaîne
 * `cookie-banner` → `use-analytics` → ce module. Il est désormais chargé par un
 * `import()` dans `components/posthog-init.tsx`, qui dépose le client ici — ce
 * fichier n'en garde qu'un type, effacé à la compilation.
 *
 * Tant que rien n'est déposé (pas de clé, hôte local, chunk pas encore
 * téléchargé), la référence reste `null` et tous les appels sont inertes :
 * exactement le contrat d'avant, où ils tapaient sur un singleton non
 * initialisé.
 */
let client: PostHog | null = null;

/** Appelé par `PostHogInit` juste avant `posthog.init()`. */
export function setAnalyticsClient(instance: PostHog): void {
  client = instance;
}

/** Le client chargé, ou `null` — à relire à chaque appel, jamais à mémoriser. */
export function getAnalyticsClient(): PostHog | null {
  return client;
}

/**
 * Émission d'un événement analytics HORS composant React (MIN-78).
 *
 * `useAnalytics()` couvre les composants ; beaucoup d'actions intéressantes
 * vivent en revanche dans la couche API (`lib/*-api.ts`) ou dans un store
 * zustand — du code sans hooks. Les deux visent le même client, avec exactement
 * les mêmes garanties : catalogue typé, allowlist runtime, sanitisation des
 * props.
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
 * Les deux natures d'appel attendent donc l'init plutôt que de se perdre :
 *   - l'ÉTAT (identité, groupe, propriétés de personne) est REJOUÉ ici. Ce
 *     n'est pas un événement daté mais un contexte : l'appliquer avec quelques
 *     centaines de millisecondes de retard est exact, le perdre ne l'est pas ;
 *   - les ÉVÉNEMENTS (`trackEvent`) sont mis en file et rejoués AVEC leur
 *     horodatage d'émission (MIN-150 — voir `pendingEvents`). Ils l'étaient
 *     autrefois pas, et ça coûtait la totalité des événements « vu ».
 *
 * L'ordre du rejeu compte : l'identité D'ABORD, les événements ENSUITE, pour
 * qu'un événement mis en file avant la connaissance du compte parte quand même
 * sous le bon `distinct_id`.
 */
let analyticsReady = false;
const readyWaiters = new Set<() => void>();

/** Appelé par `PostHogInit` une fois `posthog.init()` passé. */
export function markAnalyticsReady(): void {
  if (analyticsReady) return;
  analyticsReady = true;
  // Copie avant itération : un callback peut en enregistrer un autre.
  for (const cb of [...readyWaiters]) {
    readyWaiters.delete(cb);
    cb();
  }
  // Après l'identité, jamais avant : voir l'en-tête.
  flushPendingEvents();
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

/**
 * Les événements émis AVANT l'init, en attente de leur client (MIN-150).
 *
 * Ils étaient jetés, et c'était écrit comme un coût assumé du chargement
 * différé. La mesure a tranché autrement : `landing_viewed` est émis au montage
 * de CHAQUE visite de la landing, et PostHog n'en avait pas reçu un seul en
 * 180 jours — quand `cookie_consent_choice` (9) et `landing_cta_clicked` (3),
 * eux, arrivaient sur la même période. Rien d'aléatoire là-dedans : un effet de
 * montage passe toujours avant un `requestIdleCallback`, un clic toujours
 * après. Ce n'était donc pas « quelques événements perdus au démarrage », c'est
 * toute une CATÉGORIE d'événements — les « vu » — qui n'existait pas, et la
 * première marche de l'entonnoir d'acquisition avec elle.
 *
 * L'objection d'origine (« rejouer un événement passé fausserait son
 * horodatage ») avait une réponse dans l'API : `capture` accepte l'instant en
 * troisième argument. On garde donc l'heure d'émission, pas celle du rejeu.
 *
 * La file est bornée : au-delà, un onglet qui n'initialise jamais PostHog (pas
 * de clé, refus cookies) accumulerait sans fin. Vingt suffisent — c'est déjà
 * plus d'événements qu'une page n'en émet avant d'être interactive.
 */
const MAX_PENDING_EVENTS = 20;
const pendingEvents: {
  event: string;
  props: Record<string, unknown> | undefined;
  at: Date;
}[] = [];

/** Rejoue la file sur le client fraîchement initialisé, puis la vide. */
function flushPendingEvents(): void {
  const queued = pendingEvents.splice(0, pendingEvents.length);
  const posthog = getAnalyticsClient();
  // Pas de client (pas de clé, hôte local) : la file se vide sans partir.
  if (!posthog?.__loaded) return;
  for (const { event, props, at } of queued) {
    posthog.capture(event, props, { timestamp: at });
  }
}

export function trackEvent<E extends AnalyticsEventName>(
  event: E,
  props?: AnalyticsPropsFor<E>
): void {
  if (typeof window === "undefined") return;
  const safeEvent = sanitizeAnalyticsEventName(event);
  if (!safeEvent || !ALLOWED_ANALYTICS_EVENTS.has(safeEvent as AnalyticsEventName)) return;
  const safeProps = sanitizeAnalyticsProps(props as Record<string, unknown> | undefined);

  // L'init est différée (voir components/posthog-init.tsx) : ce qui arrive
  // avant elle attend son tour au lieu de disparaître.
  const posthog = getAnalyticsClient();
  if (!posthog?.__loaded) {
    if (pendingEvents.length < MAX_PENDING_EVENTS) {
      pendingEvents.push({ event: safeEvent, props: safeProps, at: new Date() });
    }
    return;
  }
  posthog.capture(safeEvent, safeProps);
}

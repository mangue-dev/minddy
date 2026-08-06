import "server-only";

/**
 * Ce qu'une route rend d'un abonnement push — la liste est ici, une fois, parce
 * que ce qu'elle N'A PAS est le point.
 *
 * `p256dh` et `auth` sont les clés du chiffrement de bout en bout (RFC 8291) :
 * des SECRETS d'appareil. Qui les détient avec l'endpoint peut pousser une
 * notification à cette personne. Elles n'ont donc rien à faire ni dans une
 * réponse d'API, ni dans l'export RGPD — et `select("*")` les y mettrait.
 *
 * `endpoint`, lui, sort : le client s'en sert pour reconnaître « cet
 * appareil-ci » dans la liste, en le comparant à celui de son propre
 * `PushSubscription`. Il est déjà connu du navigateur qui le lit.
 */
export const PUSH_DEVICE_COLUMNS =
  "id, endpoint, device_label, locale, enabled, created_at, last_seen_at, last_push_at";

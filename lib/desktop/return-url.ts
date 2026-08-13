import { DESKTOP_RETURN_PATH } from "@/lib/desktop/config";

/**
 * Où renvoyer quelqu'un qu'on envoie chez un tiers (MIN-293).
 *
 * Le tiers — Stripe — n'accepte qu'une URL http(s) en retour. Depuis le web,
 * c'est la page elle-même ; depuis l'app de bureau, c'est la page de rebond, qui
 * rouvre l'app dessus (app/desktop/return/route.ts).
 *
 * **`fromDesktop` vient du CORPS de la requête, pas de l'user agent.** C'est la
 * règle de lib/desktop/bridge.ts : ce qui décide, c'est la présence du pont, que
 * seule la page peut constater. Le suffixe d'user agent est là pour les logs.
 * Et le pire qu'un client puisse obtenir en mentant est de se faire renvoyer
 * vers une app qu'il n'a pas — sur SA propre session.
 */
export function billingReturnUrl(
  origin: string,
  path: string,
  fromDesktop: boolean
): string {
  if (!fromDesktop) return `${origin}${path}`;
  return `${origin}${DESKTOP_RETURN_PATH}?next=${encodeURIComponent(path)}`;
}

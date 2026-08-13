/**
 * `minddy://open?next=…` — ramener la fenêtre sur une page précise (MIN-293).
 *
 * ## Pourquoi il existe
 *
 * Stripe. Le paiement s'ouvre dans le navigateur système, et c'est normal : une
 * page de carte bancaire dans une fenêtre installée est exactement ce qu'on ne
 * veut pas avoir à faire auditer. Mais Stripe revient ensuite sur son
 * `success_url` — une URL **http(s)**, il n'en accepte pas d'autre — et ce
 * retour se faisait dans le navigateur. On finissait un achat commencé dans
 * l'app en se retrouvant devant sa page de facturation dans Safari, l'app
 * toujours ouverte derrière, toujours sur l'ancien plan.
 *
 * D'où le rebond en deux temps : Stripe revient sur une page à nous
 * (`/desktop/return`, app/desktop/return/route.ts), qui n'existe que pour
 * rouvrir l'app sur ce lien-ci. Le même chemin vaudra pour tout aller-retour du
 * même genre — c'est pour ça que le lien porte une DESTINATION et pas « le
 * paiement est fini ».
 *
 * ## Les deux moitiés, et pourquoi elles sont dans le même fichier
 *
 * `buildDesktopOpenUrl` est lue par la page de rebond, servie au NAVIGATEUR ;
 * `parseDesktopOpenLink` est lue par le MAIN PROCESS, qui reçoit le lien. Même
 * raison qu'entre les deux moitiés de auth-link.ts : c'est un contrat entre deux
 * process, et les relire séparément ne le vérifie pas.
 *
 * ## Ce que la destination ne peut pas être
 *
 * Un chemin interne, et rien d'autre (`sanitizeInternalRedirectPath`). Le lien
 * arrive du système : macOS livre à l'app TOUT ce qui porte notre schéma, y
 * compris ce qu'on n'a jamais émis. Une destination absolue serait une fenêtre
 * qu'un tiers peut pointer où il veut.
 */

import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";
import { DESKTOP_OPEN_HOST, DESKTOP_PROTOCOL } from "@/lib/desktop/config";

/** `minddy://open?next=/billing%3Fbilling%3Dsuccess`. */
export function buildDesktopOpenUrl(next: string): string {
  const params = new URLSearchParams({
    next: sanitizeInternalRedirectPath(next),
  });
  return `${DESKTOP_PROTOCOL}://${DESKTOP_OPEN_HOST}?${params.toString()}`;
}

/**
 * Lit un `minddy://open`. Rend `null` pour tout le reste — y compris pour
 * `minddy://auth`, qui a son propre lecteur.
 */
export function parseDesktopOpenLink(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${DESKTOP_PROTOCOL}:`) return null;
  // `minddy://open?x=1` range l'hôte dans `hostname`, `minddy:open?x=1` dans le
  // chemin. Les deux formes circulent selon qui compose l'URL — même tolérance
  // que pour le lien d'authentification.
  const host = url.hostname || url.pathname.replace(/^\/*/, "");
  if (host !== DESKTOP_OPEN_HOST) return null;
  const next = url.searchParams.get("next");
  if (!next) return null;
  return sanitizeInternalRedirectPath(next);
}

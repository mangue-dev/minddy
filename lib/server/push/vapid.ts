import "server-only";

import webpush from "web-push";

/**
 * La configuration VAPID du serveur — l'identité qui signe chaque envoi Web Push
 * (MIN-183).
 *
 * Tout part d'ici parce que tout doit pouvoir s'ÉTEINDRE ici : en local sans
 * clés, en preview sur une branche qui n'en a pas, l'app doit continuer de
 * tourner et l'inbox de se remplir. `isPushConfigured()` est donc le
 * court-circuit que la chaîne d'envoi consulte avant de faire quoi que ce soit —
 * pas un `throw` de démarrage, pas un `!` sur `process.env`.
 *
 * `setVapidDetails` est un état de MODULE dans `web-push` : l'appeler à chaque
 * envoi serait une réécriture globale par requête. Le drapeau ci-dessous le
 * réduit à une fois par instance, comme le singleton de lib/supabase-service.ts
 * — et sous Fluid Compute, l'instance étant réutilisée, c'est une fois pour
 * beaucoup d'envois.
 */

/** Le contact que le service de push voit passer — `mailto:` ou `https:`, la
 *  RFC 8292 n'admet rien d'autre. Une valeur bancale ferait échouer TOUS les
 *  envois : on désactive alors la capacité. */
function vapidSubject(): string | null {
  const raw = process.env.VAPID_SUBJECT?.trim();
  if (!raw) return null;
  if (raw.startsWith("mailto:") || raw.startsWith("https://")) return raw;
  console.error(
    `[push] VAPID_SUBJECT invalide (${raw}) — attendu mailto: ou https: ; Web Push désactivé`
  );
  return null;
}

/** Vrai quand la paire de clés est là. Tout le reste de la chaîne d'envoi en
 *  dépend : faux → no-op silencieux, jamais d'exception. */
export function isPushConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
    !!process.env.VAPID_PRIVATE_KEY?.trim() &&
    !!vapidSubject()
  );
}

let configured = false;

/**
 * Arme `web-push` avec la paire VAPID, une fois par instance. Rend `false` quand
 * il n'y a rien à armer — l'appelant s'arrête là.
 */
export function configureWebPush(): boolean {
  // La présence des clés est REVÉRIFIÉE à chaque appel, avant le drapeau : le
  // drapeau ne dit que « `setVapidDetails` a déjà été appelé », jamais « le
  // push est allumé ». Les intervertir ferait répondre `true` à une instance
  // dont les clés ont disparu de l'environnement, et l'extinction propre — le
  // contrat de ce fichier — ne tiendrait plus qu'au redémarrage du processus.
  if (!isPushConfigured()) return false;
  if (configured) return true;
  try {
    webpush.setVapidDetails(
      vapidSubject()!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim(),
      process.env.VAPID_PRIVATE_KEY!.trim()
    );
    configured = true;
    return true;
  } catch (e) {
    // Une clé mal recopiée (mauvaise longueur, base64url tronqué) lève ICI, au
    // premier armement, et non à chaque envoi. On le dit une fois et on éteint.
    console.error("[push] clés VAPID refusées:", (e as Error).message);
    return false;
  }
}

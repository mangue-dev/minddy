/**
 * L'URL publique d'un board de feedback (MIN-106) — partagé client/serveur.
 *
 * Un board répond sous DEUX hosts : `www.minddy.app/f/<token>` toujours, et le
 * domaine personnalisé du client (MIN-36) quand il en a attaché un. Celui qui
 * fait foi est le domaine du client — c'est son site, pas le nôtre, et c'est
 * l'URL qu'il veut voir dans le code de son app.
 *
 * Mais seulement une fois VÉRIFIÉ. Un domaine `pending` est une ligne en base
 * dont le DNS ne pointe encore nulle part : le donner à un agent qui code un
 * bouton produirait un lien mort, et la panne n'apparaîtrait qu'en production,
 * chez les utilisateurs. Tant que Vercel n'a pas confirmé, l'URL de référence
 * reste celle en `/f/<token>`, qui, elle, marche toujours.
 *
 * La règle vivait jusqu'ici en ligne dans `components/project-feedback-settings.tsx` ;
 * Numo et le serveur MCP la partagent maintenant avec lui.
 */

export interface BoardCustomDomain {
  domain: string;
  status: "pending" | "verified";
}

export function feedbackBoardUrl(input: {
  token: string;
  /** Origine du site minddy, sans slash final (`SITE_URL` côté serveur). */
  origin: string;
  customDomain?: BoardCustomDomain | null;
}): string {
  const custom = input.customDomain;
  if (custom && custom.status === "verified" && custom.domain) {
    return `https://${custom.domain}`;
  }
  return `${input.origin.replace(/\/$/, "")}/f/${input.token}`;
}

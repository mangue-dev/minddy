/**
 * Compléter une adresse tapée à la main (MIN-184).
 *
 * Personne ne tape `https://`. Un lien se colle ou se dicte — « linear.app »,
 * « www.exemple.fr/docs » — et le refuser pour un schéma manquant, c'est
 * demander à l'utilisateur de faire le travail que la machine sait faire.
 *
 * La règle vit ici, en un seul endroit, parce que les DEUX bouts l'appliquent :
 * le dialog du navigateur avant d'envoyer, et
 * [favicon.ts](./server/favicon.ts) avant de résoudre — ce dernier étant aussi
 * ce que touchent `minddy_add_resource` et le tool `add_resource` de Numo, où
 * aucun dialog n'est passé avant. Deux normalisations divergentes voudraient
 * dire qu'une URL acceptée dans l'app est refusée par un agent, ou l'inverse.
 */

/**
 * `linear.app` n'a pas de schéma, `javascript:alert(1)` en a un, et
 * `exemple.com:8080` ressemble aux deux. Ce qui les départage : un vrai schéma
 * ne contient JAMAIS de point. `exemple.com:` est donc un hôte suivi d'un port,
 * à préfixer — pas un protocole exotique à laisser se faire refuser plus bas.
 */
export function hasUrlScheme(value: string): boolean {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(value.trim());
  return !!match && !match[1].includes(".");
}

/** L'adresse telle qu'on la donnera à `new URL` : inchangée si elle porte déjà
    un schéma, préfixée de `https://` sinon. Ne juge PAS de sa validité. */
export function withUrlScheme(raw: string): string {
  const trimmed = raw.trim();
  return hasUrlScheme(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * L'adresse complétée SI c'est une URL web plausible, null sinon. Un
 * pré-contrôle, pas une autorisation : le serveur revalide tout (protocole, IP
 * privées, DNS) — ici on ne fait qu'éviter un aller-retour pour une saisie qui
 * n'a manifestement aucune chance.
 */
export function normalizeWebUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = withUrlScheme(trimmed);
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Un hôte sans point n'est pas joignable publiquement (`localhost`, un nom
    // d'intranet) : le serveur le refuserait de toute façon, autant le dire tout
    // de suite, dans le champ où l'adresse vient d'être saisie.
    if (!url.hostname.includes(".")) return null;
    return candidate;
  } catch {
    return null;
  }
}

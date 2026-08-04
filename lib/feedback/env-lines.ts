/**
 * Aucun credential ne voyage plus dans les prompts d'intégration (MIN-37) : le
 * prompt NOMME une variable d'environnement, l'interface montre la LIGNE à
 * coller, et c'est l'utilisateur qui la renseigne. Vaut pour les deux canaux —
 * le secret de signature SSO du board public, la clé de l'API — de sorte qu'un
 * prompt puisse se coller dans un agent tiers, rester ouvert dans un onglet ou
 * partir chez Numo sans qu'on ait à le traiter comme un secret.
 *
 * Le contrat tient donc en deux endroits qui doivent dire exactement la même
 * chose : le nom de la variable cité par le prompt, et la ligne qu'on copie
 * pour la remplir. Les deux sortent d'ici — module pur, lu côté serveur (les
 * prompts) comme côté client (les blocs « à coller dans votre .env »).
 */

/** Nom de la variable d'environnement qui porte le secret de signature SSO. */
export const SSO_ENV_VAR = "MINDDY_SSO_SECRET";

/** Une affectation de `.env` — ce qu'on affiche ET ce qu'on copie, partout. */
export function envLine(name: string, value: string): string {
  return `${name}=${value}`;
}

/** La ligne du secret SSO du board public. */
export function ssoEnvLine(secret: string): string {
  return envLine(SSO_ENV_VAR, secret);
}

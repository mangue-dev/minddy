/**
 * Le secret SSO du board ne voyage plus dans le prompt d'intégration : le prompt
 * dit à l'agent de LIRE une variable d'environnement, et c'est l'utilisateur qui
 * la renseigne — un texte qu'on colle dans un agent tiers, qu'on garde ouvert
 * dans un onglet ou qu'on montre à un collègue n'emporte plus le secret avec lui.
 *
 * Le contrat tient donc en deux endroits qui doivent dire exactement la même
 * chose : le nom de la variable dans le prompt, et la ligne qu'on copie pour la
 * remplir. Les deux sortent d'ici — module pur, lu côté serveur (le prompt) comme
 * côté client (le bloc « à coller dans votre .env »).
 */

/** Nom de la variable d'environnement qui porte le secret de signature SSO. */
export const SSO_ENV_VAR = "MINDDY_SSO_SECRET";

/** La ligne prête à coller dans un `.env` — ce qu'on affiche ET ce qu'on copie. */
export function ssoEnvLine(secret: string): string {
  return `${SSO_ENV_VAR}=${secret}`;
}

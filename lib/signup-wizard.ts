/**
 * Ce que le wizard d'inscription SAIT, hors de tout écran (MIN-300).
 *
 * L'inscription n'est plus un onglet du formulaire de connexion : c'est un
 * parcours à trois étapes, sur sa propre route (`/signup`). Ce module en porte
 * la partie qui se raisonne — l'ordre des étapes, ce qui rend une étape valide,
 * et les paramètres d'URL qui doivent survivre au passage d'un écran d'auth à
 * l'autre. Le composant, lui, ne fait que dessiner et appeler Supabase.
 *
 * La validation rend un CODE, jamais une phrase : le message est traduit à
 * l'affichage (namespace `Auth`), et un module testé en `environment: node`
 * n'a pas de traducteur sous la main.
 */

import { passwordMeetsPolicy } from "@/lib/password-policy";

/** Les étapes, dans l'ordre. Le parcours par e-mail les traverse toutes. */
export const SIGNUP_STEPS = ["account", "identity", "password"] as const;

export type SignupStep = (typeof SIGNUP_STEPS)[number];

export interface SignupValues {
  email: string;
  fullName: string;
  password: string;
  confirmPassword: string;
}

/**
 * Ce qui manque à l'étape courante. Chaque code est une clé du namespace
 * `Auth` — la table de correspondance vit dans le composant, pour que le
 * contrat i18n reste vérifiable par `lib/i18n-contract.test.ts`.
 */
export type SignupIssue =
  | "emailRequired"
  | "emailInvalid"
  | "nameRequired"
  | "passwordPolicy"
  | "passwordMismatch";

/**
 * Assez pour attraper la faute de frappe, pas assez pour prétendre valider une
 * adresse : seule la confirmation par e-mail le fait vraiment. Le navigateur
 * applique la même règle sur un `<input type="email">` — celle-ci existe pour
 * que le bouton « Continuer » sache dire non AVANT la soumission.
 */
export function isValidEmail(value: string): boolean {
  const email = value.trim();
  if (email.length < 3 || /\s/.test(email)) return false;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return false;
  const domain = email.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

/** Ce qui bloque cette étape, ou `null` si elle peut avancer. */
export function validateSignupStep(
  step: SignupStep,
  values: SignupValues
): SignupIssue | null {
  switch (step) {
    case "account":
      if (!values.email.trim()) return "emailRequired";
      return isValidEmail(values.email) ? null : "emailInvalid";
    case "identity":
      // Le nom est le seul champ de son étape : la sauter à vide donnerait un
      // compte dont l'app afficherait l'adresse e-mail partout (cf. la règle
      // de display-name), ce qu'on ne veut ni pour lui ni pour ses coéquipiers.
      return values.fullName.trim() ? null : "nameRequired";
    case "password":
      // La politique d'abord : elle est AFFICHÉE, règle par règle, sous le
      // champ. Comparer les deux saisies avant de la tenir ferait apparaître
      // « ne correspondent pas » sur un mot de passe que le serveur allait de
      // toute façon refuser.
      if (!passwordMeetsPolicy(values.password)) return "passwordPolicy";
      return values.password === values.confirmPassword ? null : "passwordMismatch";
  }
}

/** L'étape suivante, ou `null` sur la dernière. */
export function nextSignupStep(step: SignupStep): SignupStep | null {
  return SIGNUP_STEPS[SIGNUP_STEPS.indexOf(step) + 1] ?? null;
}

/** L'étape précédente, ou `null` sur la première. */
export function previousSignupStep(step: SignupStep): SignupStep | null {
  const index = SIGNUP_STEPS.indexOf(step);
  return index > 0 ? (SIGNUP_STEPS[index - 1] ?? null) : null;
}

/**
 * Les paramètres qui doivent SUIVRE d'un écran d'auth à l'autre, et eux seuls.
 *
 * `redirect` porte la destination d'origine (le proxy la pose en renvoyant ici),
 * `invite` porte le lien d'invitation : passer de « créer un compte » à « j'ai
 * déjà un compte » en les perdant renverrait la personne sur `/home` sans
 * jamais rejoindre le projet qui l'attendait. Tout le reste (`error`, `mode`,
 * un `utm_*`…) appartient à l'écran d'où l'on vient et ne se recopie pas.
 *
 * Rend une chaîne de requête préfixée de `?`, ou `""` s'il n'y a rien à passer.
 */
export function preserveAuthParams(
  search: URLSearchParams | string,
  extra?: Record<string, string>
): string {
  const source =
    typeof search === "string" ? new URLSearchParams(search) : search;
  const kept = new URLSearchParams();
  for (const key of ["redirect", "invite"] as const) {
    const value = source.get(key);
    if (value) kept.set(key, value);
  }
  for (const [key, value] of Object.entries(extra ?? {})) kept.set(key, value);
  const query = kept.toString();
  return query ? `?${query}` : "";
}

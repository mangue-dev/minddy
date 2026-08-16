/**
 * Ce qu'un mot de passe doit valoir, DIT AVANT d'être exigé (MIN-300).
 *
 * Les règles sont celles du projet Supabase (Auth → Password Requirements) :
 * huit caractères, une minuscule, une majuscule, un chiffre. Elles étaient
 * appliquées là-bas et nulle part ici — la personne tapait son mot de passe,
 * cliquait, et récupérait une phrase anglaise du serveur listant des conditions
 * qu'on ne lui avait jamais montrées.
 *
 * Les mêmes règles sont donc évaluées ici, à la frappe : l'écran affiche la
 * liste, elle se coche à mesure, et le bouton n'est actif qu'une fois tout vert.
 * Le refus du serveur devient un filet, plus un mode de dialogue.
 *
 * **Ce module reste la copie d'une vérité qui vit ailleurs.** Changer la
 * politique dans le dashboard Supabase sans la changer ici, c'est réintroduire
 * exactement ce qu'on corrige — ou pire, un bouton actif sur un mot de passe que
 * le serveur refusera. Les valeurs en vigueur sont consignées dans le bloc
 * « Durcissement Auth » de [.env.example](../.env.example), avec le contrôle de
 * fuite (HIBP) qui, lui, n'a pas d'équivalent ici : c'est un appel réseau de
 * GoTrue, et il ressort en `weak_password`.
 */

export const MIN_PASSWORD_LENGTH = 8;

/**
 * L'identifiant d'une règle est une clé du namespace `Auth` : c'est l'écran qui
 * traduit, un module testé en `environment: node` n'a pas de traducteur.
 */
export type PasswordRuleId =
  | "passwordRuleLength"
  | "passwordRuleLower"
  | "passwordRuleUpper"
  | "passwordRuleDigit";

interface PasswordRule {
  id: PasswordRuleId;
  test: (password: string) => boolean;
}

/** Dans l'ordre où l'écran les montre. */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: "passwordRuleLength", test: (p) => p.length >= MIN_PASSWORD_LENGTH },
  { id: "passwordRuleLower", test: (p) => /[a-z]/.test(p) },
  { id: "passwordRuleUpper", test: (p) => /[A-Z]/.test(p) },
  { id: "passwordRuleDigit", test: (p) => /\d/.test(p) },
];

/**
 * L'état de chaque règle, dans l'ordre d'affichage. Rendu à chaque frappe, donc
 * on rend la liste entière : un indicateur qui ne montrerait que la règle
 * suivante ferait deviner les autres.
 *
 * Les classes de caractères sont volontairement ASCII, comme celles de GoTrue
 * (`[a-z]`, `[A-Z]`, `[0-9]`) : « É » n'y compte pas pour une majuscule, et une
 * liste qui dirait le contraire mentirait au moment du refus.
 */
export function checkPassword(
  password: string
): { id: PasswordRuleId; met: boolean }[] {
  return PASSWORD_RULES.map((rule) => ({ id: rule.id, met: rule.test(password) }));
}

/** Toutes les règles sont tenues. */
export function passwordMeetsPolicy(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

/**
 * What a password must be worth, SAID BEFORE being required (MIN-300).
 *
 * The rules are those of the Supabase project (Auth → Password Requirements):
 * eight characters, one lower case, one upper case, one number. They were
 * applied there and nowhere here — the person typed their password,
 * clicked, and retrieved an English sentence from the server listing conditions
 * that had never been shown to them.
 *
 * The same rules are therefore evaluated here, when typing: the screen displays the
 * list, it is checked as it goes, and the button is only active once it is green.
 * The server's refusal becomes a net, no longer a dialogue mode.
 *
 * **This module remains the copy of a truth that lives elsewhere.** Change the
 * policy in the Supabase dashboard without changing it here, it's reintroducing
 * exactly what we're correcting — or worse, an active button on a password that
 * the server will refuse. The values in force are recorded in the
 * “Auth hardening” block of [.env.example](../.env.example), with the check of
 * leak (HIBP) which has no equivalent here: it is a network call of
 * GoTrue, and it comes out in `weak_password`.
 */

export const MIN_PASSWORD_LENGTH = 8;

/**
 * The identifier of a rule is a key of the `Auth` namespace: it is the screen which
 * translates, a module tested in `environment: node` does not have a translator.
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

/** In the order the screen shows them. */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: "passwordRuleLength", test: (p) => p.length >= MIN_PASSWORD_LENGTH },
  { id: "passwordRuleLower", test: (p) => /[a-z]/.test(p) },
  { id: "passwordRuleUpper", test: (p) => /[A-Z]/.test(p) },
  { id: "passwordRuleDigit", test: (p) => /\d/.test(p) },
];

/**
 * The status of each rule, in display order. Rendered on each keystroke, so
 * we render the entire list: an indicator which would only show the following rule
 * would make the others guess.
 *
 * The character classes are deliberately ASCII, like those of GoTrue
 * (`[a-z]`, `[A-Z]`, `[0-9]`): accented letters do not count as capital letters, and a
 * list which says otherwise would lie at the time of refusal.
 */
export function checkPassword(
  password: string
): { id: PasswordRuleId; met: boolean }[] {
  return PASSWORD_RULES.map((rule) => ({ id: rule.id, met: rule.test(password) }));
}

/** All rules are followed. */
export function passwordMeetsPolicy(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

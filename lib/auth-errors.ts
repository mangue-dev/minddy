/**
 * Les refus de Supabase Auth, dits dans la langue de l'écran (MIN-300).
 *
 * `error.message` arrive en anglais, écrit pour un développeur : « Password is
 * known to be weak and easy to guess, please choose a different one. », « User
 * already registered ». C'était ce qu'on affichait — au milieu d'une interface
 * française, sous un formulaire d'inscription.
 *
 * On traduit par le CODE, pas par le message : `AuthApiError` porte un
 * `code` stable (`weak_password`, `user_already_exists`…), là où le message est
 * une phrase libre que GoTrue reformule d'une version à l'autre. Un code inconnu
 * retombe sur le message d'origine : mieux vaut une phrase anglaise exacte
 * qu'une phrase française approximative — et le trou se voit, ce qui est la
 * seule façon de le combler un jour.
 *
 * Les codes retenus sont ceux qu'un écran d'auth peut vraiment produire. La
 * liste n'a pas à être exhaustive ; elle a à être juste.
 */

/** Les clés du namespace `Auth` qui traduisent un refus. */
export type AuthErrorKey =
  | "errorWeakPassword"
  | "errorUserExists"
  | "errorInvalidCredentials"
  | "errorEmailNotConfirmed"
  | "errorInvalidEmail"
  | "errorSamePassword"
  | "errorRateLimited"
  | "errorSignupDisabled"
  | "errorUnexpected";

const BY_CODE: Record<string, AuthErrorKey> = {
  weak_password: "errorWeakPassword",
  user_already_exists: "errorUserExists",
  email_exists: "errorUserExists",
  invalid_credentials: "errorInvalidCredentials",
  email_not_confirmed: "errorEmailNotConfirmed",
  email_address_invalid: "errorInvalidEmail",
  same_password: "errorSamePassword",
  over_email_send_rate_limit: "errorRateLimited",
  over_request_rate_limit: "errorRateLimited",
  signup_disabled: "errorSignupDisabled",
  email_provider_disabled: "errorSignupDisabled",
};

/**
 * Le repli sur le MESSAGE, pour les refus que GoTrue rend sans code — c'est le
 * cas des versions plus anciennes, et de certaines erreurs de validation. On ne
 * teste que des fragments stables, en minuscules, et jamais une phrase entière.
 */
const BY_MESSAGE: [RegExp, AuthErrorKey][] = [
  [/known to be weak|password is too weak/i, "errorWeakPassword"],
  [/already registered|already exists/i, "errorUserExists"],
  [/invalid login credentials/i, "errorInvalidCredentials"],
  [/email not confirmed/i, "errorEmailNotConfirmed"],
  [/rate limit|too many requests/i, "errorRateLimited"],
];

/**
 * La clé de traduction d'un refus, ou `null` s'il faut garder son message.
 *
 * Accepte n'importe quoi : ce qui remonte d'un `catch` n'est pas typé, et une
 * panne réseau y passe aussi.
 */
export function authErrorKey(error: unknown): AuthErrorKey | null {
  if (!error || typeof error !== "object") return null;

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") {
    const byCode = BY_CODE[code];
    if (byCode) return byCode;
  }

  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return null;
  for (const [pattern, key] of BY_MESSAGE) {
    if (pattern.test(message)) return key;
  }
  return null;
}

/**
 * Un message qui ne DIT rien : vide, ou fait de ponctuation seule.
 *
 * Le cas réel derrière ce test est `{}`, affiché tel quel sous le formulaire
 * d'inscription. supabase-js construit son `AuthApiError` en recopiant le champ
 * `msg` du corps de la réponse — et quand ce corps n'en a pas (une 5xx du
 * réseau, un corps vide renvoyé par la passerelle), il retombe sur
 * `JSON.stringify(body)`, c'est-à-dire la chaîne « {} ».
 *
 * On ne peut pas le traduire, puisqu'on ne sait pas ce qui s'est passé ; on peut
 * refuser de le montrer. « Une erreur est survenue » est vague, mais c'est une
 * phrase — « {} » n'en est pas une.
 */
function saysNothing(message: string): boolean {
  return !/\p{L}|\p{N}/u.test(message);
}

/**
 * Le message à afficher : la traduction si on sait, le message d'origine s'il
 * veut dire quelque chose, une phrase générique sinon. Ne rend JAMAIS de chaîne
 * vide : un échec silencieux laisse le bouton retomber sans rien dire, et donne
 * l'impression que le clic n'a pas été pris.
 *
 * `translate` est le `t` de l'écran, restreint au namespace `Auth`.
 */
export function authErrorMessage(
  error: unknown,
  translate: (key: AuthErrorKey) => string
): string {
  const key = authErrorKey(error);
  if (key) return translate(key);
  const message = (error as { message?: unknown })?.message;
  if (typeof message !== "string" || saysNothing(message)) {
    return translate("errorUnexpected");
  }
  return message;
}

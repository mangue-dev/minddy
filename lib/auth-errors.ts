/**
 * Supabase Auth refusals, said in the screen language (MIN-300).
 *
 * `error.message` arrives in English, written for a developer: “Password is
 * known to be weak and easy to guess, please choose a different one. », “User
 * already registered”. This was what we displayed — in the middle of a French interface
 *, under a registration form.
 *
 * We translate by the CODE, not by the message: `AuthApiError` carries a stable
 * `code` (`weak_password`, `user_already_exists`…), where the message is
 * a free phrase that GoTrue reformulates from one version to another. An unknown code
 * falls back on the original message: better an exact English sentence
 * than an approximate French sentence — and the hole is visible, which is the
 * only way to fill it one day.
 *
 * The codes retained are those that a screen d'auth can really produce. The
 * list does not have to be exhaustive; it has to be fair.
 */

/** The keys of the namespace `Auth` which reflect a refusal. */
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
 * The fallback on the MESSAGE, for the refusals that GoTrue renders without code — this is the
 * case of older versions, and of certain validation errors. We only
 * test stable fragments, in lower case, and never an entire sentence.
 */
const BY_MESSAGE: [RegExp, AuthErrorKey][] = [
  [/known to be weak|password is too weak/i, "errorWeakPassword"],
  [/already registered|already exists/i, "errorUserExists"],
  [/invalid login credentials/i, "errorInvalidCredentials"],
  [/email not confirmed/i, "errorEmailNotConfirmed"],
  [/rate limit|too many requests/i, "errorRateLimited"],
];

/**
 * The translation key for a refusal, or `null` if you have to keep your message.
 *
 * Accepts anything: what comes back from a `catch` is not typed, and a
 * network failure occurs there also.
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
 * A message that SAY nothing: empty, or punctuation only.
 *
 * The actual case behind this test is `{}`, displayed as is under the registration form
 *. supabase-js constructs its `AuthApiError` by copying the
 * `msg` field from the response body — and when this body does not have one (a 5xx from the
 * network, an empty body returned by the gateway), it falls back to
 * `JSON.stringify(body)`, that is to say the string “{}”.
 *
 * We cannot translate it, since we do not know what happened; we can
 * refuse to show it. “An error has occurred” is vague, but it is a
 * phrase — “{}” is not one.
 */
function saysNothing(message: string): boolean {
  return !/\p{L}|\p{N}/u.test(message);
}

/**
 * The message to display: the translation if we know, the original message if it
 * means something, a generic sentence otherwise. NEVER returns a string
 * empty: a silent failure lets the button drop without saying anything, and makes
 * look like the click was not taken.
 *
 * `translate` is the screen's `t`, restricted to the namespace `Auth`.
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

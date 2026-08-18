/**
 * The languages ​​that the feedback translation knows how to name.
 *
 * A CLOSED GAME, and not "any language that the model wants to return": these
 * codes are stored in the database, compared to the team's language and checked in a
 * setting. Letting the model invent `pt-BR`, `Portuguese` and `por` for the
 * same would make three separate whitelisted languages, two of which would never match anything.
 *
 * ISO 639-1, two letters, without region: `fr` and not `fr-CA`. A return
 * from Quebec and a return from Belgium can be read with the same team.
 *
 * The NAMES are not here: `Intl.DisplayNames` already renders them, in the language
 * of whoever is looking and without a catalog to keep — that's exactly the kind of table
 * which rots as soon as an entry is added. See {@link languageLabel}.
 */
export const FEEDBACK_LANGUAGES = [
  "en",
  "fr",
  "es",
  "de",
  "it",
  "pt",
  "nl",
  "pl",
  "tr",
  "ru",
  "ar",
  "ja",
  "ko",
  "zh",
] as const;

export type FeedbackLanguage = (typeof FEEDBACK_LANGUAGES)[number];

export function isFeedbackLanguage(value: unknown): value is FeedbackLanguage {
  return (
    typeof value === "string" &&
    (FEEDBACK_LANGUAGES as readonly string[]).includes(value)
  );
}

/**
 * Returns what a model responded to a game code, or `null`.
 *
 * Tolerant on entry, strict on exit: `PT-BR`, `pt_BR` and ` pt ` give
 * all `pt`, and `Portuguese` gives `null` — we do not guess a code from
 * of a name, we refuse. The prompt explicitly asks for an ISO code; what
 * is not one is a non-contractual response, not a variant to be caught.
 */
export function normalizeLanguage(value: unknown): FeedbackLanguage | null {
  if (typeof value !== "string") return null;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return isFeedbackLanguage(base) ? base : null;
}

/**
 * The name of a language in the language of the person reading — “Deutsch” becomes
 * “German” for a French speaker, “German” for an English speaker.
 *
 * **With a capital letter**, which French does not use. `Intl.DisplayNames` renders
 * the name as it is written IN A SENTENCE, but it never appears in a
 * sentence here: it is a list option, a checkbox, a label. HAS
 * next to "French" set by the language selector of the app, an "English"
 * in lower case reads like a typo.
 *
 * The case switch is made with the locale (`toLocaleUpperCase`) and not
 * without: in Turkish, the uppercase of `i` is `İ`, and `I` would be another letter.
 * Caseless scripts (Japanese, Arabic) pass through unchanged.
 *
 * Raw fallback code: a zero environment `Intl.DisplayNames` (or a local
 * that it doesn't know) should display `de`, never anything.
 */
export function languageLabel(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: "language" }).of(code);
    if (!name) return code;
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch {
    return code;
  }
}

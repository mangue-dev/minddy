export const locales = ["fr", "en", "de", "pt-BR", "it", "es"] as const;
export type Locale = (typeof locales)[number];
// English is the default when no supported preference is available.
export const defaultLocale: Locale = "en";

export const intlLocaleByLocale: Record<Locale, string> = {
  en: "en-GB",
  fr: "fr-FR",
  de: "de-DE",
  "pt-BR": "pt-BR",
  it: "it-IT",
  es: "es-ES",
};

export const languageNameByLocale: Record<Locale, string> = {
  en: "English",
  fr: "French",
  de: "German",
  "pt-BR": "Brazilian Portuguese",
  it: "Italian",
  es: "Spanish",
};

const LOCALE_BY_TAG = new Map(
  locales.map((locale) => [locale.toLowerCase(), locale]),
);

/** Resolve an exact locale or a supported regional language tag. */
export function supportedLocaleForTag(
  raw: string | null | undefined,
): Locale | null {
  const tag = raw?.trim().toLowerCase();
  if (!tag) return null;

  const exact = LOCALE_BY_TAG.get(tag);
  if (exact) return exact;

  if (tag === "pt" || tag.startsWith("pt-br-")) return "pt-BR";
  if (tag.startsWith("pt-")) return null;

  return LOCALE_BY_TAG.get(tag.split("-")[0] ?? "") ?? null;
}

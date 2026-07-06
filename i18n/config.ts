export const locales = ["fr", "en"] as const;
export type Locale = (typeof locales)[number];
// English is the universal fallback; Accept-Language detection still serves
// French to fr-* browsers and everyone their own supported locale.
export const defaultLocale: Locale = "en";

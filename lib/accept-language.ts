import { locales, type Locale } from "@/i18n/config";

/**
 * Meilleure locale supportée d'un en-tête `Accept-Language`, ou `null`.
 *
 * Module pur (pas de `next/headers`) : le middleware (`proxy.ts`) et la
 * résolution i18n côté serveur (`i18n/request.ts`) doivent lire l'en-tête de la
 * même façon, sinon le proxy redirige vers `/fr` une requête à laquelle
 * next-intl servira de l'anglais.
 */
export function detectFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, qPart] = part.trim().split(";");
      const q = qPart?.match(/q=([0-9.]+)/)?.[1];
      return { tag: tag.toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const primary = tag.split("-")[0];
    if ((locales as readonly string[]).includes(primary)) {
      return primary as Locale;
    }
  }
  return null;
}

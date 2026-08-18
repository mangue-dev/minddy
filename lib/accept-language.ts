import { locales, type Locale } from "@/i18n/config";

/**
 * Best supported locale of a `Accept-Language` header, or `null`.
 *
 * Pure module (no `next/headers`): middleware (`proxy.ts`) and
 * i18n resolution server side (`i18n/request.ts`) must read the header of the
 * same way, otherwise the proxy redirects to `/fr` a request to which
 * next-intl will serve English.
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

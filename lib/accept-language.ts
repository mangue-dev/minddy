import { supportedLocaleForTag, type Locale } from "@/i18n/config";

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

  for (const { tag, q } of ranked) {
    if (q <= 0) continue;
    const locale = supportedLocaleForTag(tag);
    if (locale) return locale;
    }
  return null;
}

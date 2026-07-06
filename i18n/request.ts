import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, locales, type Locale } from "./config";

/** Pick the best supported locale from an Accept-Language header, or null. */
function detectFromAcceptLanguage(header: string | null): Locale | null {
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

// Resolution order: NEXT_LOCALE cookie → Accept-Language → defaultLocale.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get("NEXT_LOCALE")?.value;

  let locale: Locale;
  if (raw && (locales as readonly string[]).includes(raw)) {
    locale = raw as Locale;
  } else {
    const headerStore = await headers();
    locale =
      detectFromAcceptLanguage(headerStore.get("accept-language")) ??
      defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

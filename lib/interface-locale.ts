import { detectFromAcceptLanguage } from "./accept-language";
import { defaultLocale, locales, type Locale } from "@/i18n/config";

/**
 * The INTERFACE language, read from the browser.
 *
 * The server already has its own (`i18n/request.ts`) and does not need this.
 * This module exists for the two gestures that are played outside of rendering, in
 * `AuthProvider` :
 *
 * — registration, which places `locale` in `user_metadata` (`signUp({ data })`);
 * — upgrading existing accounts, at each session.
 *
 * Why store it in the metadata when the cookie is enough for the app:
 * authentication emails (registration confirmation, password reset
 *) are returned by GoTrue, on its servers, without request nor
 * cookie — `user_metadata` is the ONLY thing it knows about the recipient.
 * See `supabase/email-templates/`, which branches into this. A field that isn't kept up to date here, it's an email in the wrong language there.
 */

/** Pure module, so that the test does not have to mount a `document`. */
export function resolveInterfaceLocale({
  cookieHeader,
  languages,
}: {
  cookieHeader: string;
  languages: readonly string[];
}): Locale {
  const fromCookie = readCookie(cookieHeader, "NEXT_LOCALE");
  if (fromCookie && (locales as readonly string[]).includes(fromCookie)) {
    return fromCookie as Locale;
  }
  // No cookies: this is the NORMAL case of registration. The cookie is not written
  // only by the language selectors, therefore a visitor who has never changed
  // language does not have one — even though he saw the app in the language deduced from
  // his browser, the one that the server resolved for him. Without this withdrawal,
  // any French registration would be recorded in English.
  return detectFromAcceptLanguage(languages.join(",")) ?? defaultLocale;
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.split("=");
    if (rawKey.trim() === name) return decodeURIComponent(rest.join("=").trim());
  }
  return null;
}

/** The same, plugged into the browser. Makes `defaultLocale` out of browser. */
export function readInterfaceLocale(): Locale {
  if (typeof document === "undefined") return defaultLocale;
  return resolveInterfaceLocale({
    cookieHeader: document.cookie,
    languages: navigator.languages?.length
      ? navigator.languages
      : [navigator.language].filter(Boolean),
  });
}

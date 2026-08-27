import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { detectFromAcceptLanguage } from "../lib/accept-language";
import { defaultLocale, supportedLocaleForTag, type Locale } from "./config";
import { loadMessages } from "./messages";

/**
 * Resolution order: locale explicitly requested → header
 * `x-minddy-locale` → cookie `NEXT_LOCALE` → `Accept-Language` →
 * `defaultLocale`.
 *
 * **Explicit request first** (MIN-93). next-intl passes here the `locale`
 * given to `getTranslations({ locale: "fr" })`; this file ignored it, so
 * the call was of no use: the language remained that of the REQUEST. Invisible
 * so far, because the only explicit callers (`/md`, `/og`) are
 * reached by a rewrite of the proxy which already sets the header — but the feed
 * RSS from the changelog is requested live (`/changelog/rss.xml?locale=fr`)
 * and returned an advertised feed `fr-fr` filled with English titles.
 *
 * The parameter is `undefined` everywhere else: on a normal page rendering,
 * the string below is unchanged.
 *
 * The header comes FIRST and is placed by the proxy on localized public pages
 * (MIN-88): it is the URL which decides the language of an indexable page
 * (`/fr/tarifs` is French, whatever anyone says the visitor's cookie), not a
 * stored preference. Without this priority, a visitor whose cookie says "in"
 * would see `/fr` in English — and Google would index two URLs with identical content
 *.
 *
 * The cookie takes over everywhere else: it is the language of the internal app
 *, which does not have a localized URL and does not need to have one.
 *
 * A single resolution point aligns at once the Server Components
 * (`getTranslations`), the `NextIntlClientProvider` of the root layout, the
 * client components (`useLocale`) and the `<html lang>`.
 */
export default getRequestConfig(async ({ locale: requested }) => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

  const fromHeader = headerStore.get("x-minddy-locale");
  const fromCookie = cookieStore.get("NEXT_LOCALE")?.value;

  const locale =
    pick(requested) ??
    pick(fromHeader) ??
    pick(fromCookie) ??
    detectFromAcceptLanguage(headerStore.get("accept-language")) ??
    defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
  };
});

function pick(raw: string | null | undefined): Locale | null {
  return supportedLocaleForTag(raw);
}

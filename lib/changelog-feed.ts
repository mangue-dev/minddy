import { defaultLocale, type Locale } from "@/i18n/config";

/**
 * The address of the changelog feed (MIN-93), in the same place for everyone:
 * the page which announces it in its `<head>`, the “Follow in RSS” link, the
 * `robots.txt` and the route which serves it.
 *
 * A SINGLE route, in English, with the language as a parameter: `/fr/nouveautes`
 * is indeed a URL rewritten by the proxy, but the rewriting concerns
 * exact paths (`lib/public-routes.ts`) — `/fr/nouveautes/rss.xml` does not is
 * not one and would fall in 404. A parameter costs less than a second public route
 * to declare everywhere.
 */
export const CHANGELOG_FEED_PATH = "/changelog/rss.xml";

/**
 * The feed's skin, served alongside it. Declared here and not made by a
 * `replace(".xml", ".css")` on the stream path: two separate routes, two
 * constants, and renaming one doesn't silently break the other.
 */
export const CHANGELOG_FEED_STYLE_PATH = "/changelog/rss.css";

export function changelogFeedPath(locale: Locale): string {
  return withLocale(CHANGELOG_FEED_PATH, locale);
}

export function changelogFeedStylePath(locale: Locale): string {
  return withLocale(CHANGELOG_FEED_STYLE_PATH, locale);
}

/** The language travels as a parameter: these two routes are outside the localized site. */
function withLocale(path: string, locale: Locale): string {
  return locale === defaultLocale ? path : `${path}?locale=${locale}`;
}

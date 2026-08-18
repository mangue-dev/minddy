import type { Locale } from "@/i18n/config";
import { routeByPath } from "@/lib/public-routes";

/**
 * Translates a public site link into the language served (MIN-88).
 *
 * Links in the nav, footer and sections are written once, in
 * canonical English (`/pricing`, `/#tracker`, `/legal`). Without this function,
 * a visitor arriving on `/fr` left in English from the first click — and
 * each French page became a dead end for a crawler, which found
 * no link to the rest of the French version.
 *
 * The anchor is kept as is (`/#tracker` → `/fr#tracker`): the
 * section identifiers are not translated, only the path is. URLs
 * that do not have a localized equivalent (`/login`, `/signup`) are rendered
 * unchanged — they only exist in one version.
 */
export function localizedHref(href: string, locale: Locale): string {
  if (locale !== "fr") return href;

  const hashAt = href.indexOf("#");
  const path = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : href.slice(hashAt);

  const route = routeByPath(path || "/");
  if (!route) return href;

  // `/fr` + `#tracker`, not `/fr/#tracker`: both lead to the same place
  // but only the first one is the canonical URL of the page.
  return `${route.fr}${hash}`;
}

/**
 * Equivalent path of the current page in the other language — what
 * should push the footer language selector. `null` if the page does not have a
 * localized version (the internal app, `/login`…), in which case we stay put.
 */
export function switchLocaleHref(pathname: string, next: Locale): string | null {
  const route = routeByPath(pathname);
  if (!route) return null;
  return next === "fr" ? route.fr : route.en;
}

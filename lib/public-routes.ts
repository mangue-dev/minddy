/**
 * Table of public pages on the site (MIN-88) — the only one.
 *
 * Four things needed to know this list, and each had its own copy: the proxy (what to let pass without a session), the sitemap, the
 * metadata for each page, and the navigation links and footer. Four
 * lists that desynchronize on first page addition. They read
 * now this one.
 *
 * **Localized URLs, canonical English.** English lives at the root (`/`,
 * `/pricing`), French under `/fr` with slugs translated (`/fr`,
 * `/fr/tarifs`). A URL = a language: this is the only form that an engine knows
 * to index. Previously, a single URL served both languages depending on a cookie and
 * the `Accept-Language` — Googlebot only saw English, and half of the site content did not exist for anyone.
 *
 * There are NO duplicate route files under `app/fr/`: the proxy rewrites
 * `/fr/tarifs` to `/pricing` by setting `x-minddy-locale: fr`, which
 * `i18n/request.ts` reads to serve French. One page, two URLs.
 *
 * The internal app (behind the authentication) does NOT follow this model: it
 * stays on the `NEXT_LOCALE` cookie. Its URLs do not have to be indexed, so
 * nothing requires them to be split.
 */

/**
 * `lastModified` is the only one of the three sitemap fields that Google actually reads
 * (`priority` and `changeFrequency` have been ignored for a long time;
 * Bing still looks at them a little): it is he who triggers a new pass
 * of the crawler. It is therefore kept by hand, page by page - a build date
 * updated with each deployment would mean "everything has changed" each time, and Google quickly learns not to believe it anymore. **To be updated when the
 * page content changes**, not with each deployment.
 */
import { CHANGELOG_LAST_MODIFIED } from "@/lib/changelog";
import type { Namespace } from "@/lib/i18n-keys";

export interface PublicRoute {
  /** Stable key, used by `publicPageMetadata` and links. */
  key: string;
  /** URL canonique (anglais). */
  en: string;
  /** French URL. */
  fr: string;
  /** Namespace i18n where `metaTitle` and `metaDescription` live. */
  namespace: Namespace;
  /**
 * Is the title already branded? The landing is called “minddy,…”:
 * the “%s · minddy” template of the root layout would repeat it.
 */
  titleIsAbsolute?: boolean;
  /** Last actual modification of the content, in short ISO. */
  lastModified: string;
  /** Relative weight in the sitemap. */
  priority: number;
}

export const PUBLIC_ROUTES = [
  {
    key: "home",
    en: "/",
    fr: "/fr",
    namespace: "Landing",
    titleIsAbsolute: true,
    lastModified: "2026-08-12",
    priority: 1,
  },
  {
    key: "pricing",
    en: "/pricing",
    fr: "/fr/tarifs",
    namespace: "Pricing",
    lastModified: "2026-08-06",
    priority: 0.8,
  },
  {
    key: "mcp",
    en: "/mcp",
    fr: "/fr/mcp",
    namespace: "Mcp",
    lastModified: "2026-08-10",
    priority: 0.9,
  },
  // The desktop app (MIN-292). It has its own page and not a button on the landing:
  // what to say here — macOS only, and the notifications that
  // stop when the app is exited — does not fit under a button, and the
  // silence would be the only dishonesty on the site.
  {
    key: "download",
    en: "/download",
    fr: "/fr/telecharger",
    namespace: "Download",
    lastModified: "2026-08-13",
    priority: 0.7,
  },
  // Only page whose `lastModified` is NOT hand-held: here,
  // “content has changed” and “an entry has been added” are the same
  // event, and freshness is what Perplexity looks at first.
  {
    key: "changelog",
    en: "/changelog",
    fr: "/fr/nouveautes",
    namespace: "Changelog",
    lastModified: CHANGELOG_LAST_MODIFIED,
    priority: 0.6,
  },
  // A comparison = an entry, like any page (MIN-93). THE
  // slugs are the same in both languages: `alternatives` is written
  // the same, and the competitor's name is a proper noun. See
  // `lib/comparisons.ts` for choosing these three.
  {
    key: "alternativeLinear",
    en: "/alternatives/linear",
    fr: "/fr/alternatives/linear",
    namespace: "AlternativeLinear",
    lastModified: "2026-08-05",
    priority: 0.7,
  },
  {
    key: "alternativeJira",
    en: "/alternatives/jira",
    fr: "/fr/alternatives/jira",
    namespace: "AlternativeJira",
    lastModified: "2026-07-27",
    priority: 0.7,
  },
  {
    key: "alternativeNotion",
    en: "/alternatives/notion",
    fr: "/fr/alternatives/notion",
    namespace: "AlternativeNotion",
    lastModified: "2026-07-27",
    priority: 0.7,
  },
  {
    key: "legal",
    en: "/legal",
    fr: "/fr/mentions-legales",
    namespace: "Legal",
    lastModified: "2026-07-23",
    priority: 0.3,
  },
  {
    key: "terms",
    en: "/terms",
    fr: "/fr/cgu",
    namespace: "Terms",
    lastModified: "2026-08-05",
    priority: 0.3,
  },
  {
    key: "privacy",
    en: "/privacy",
    fr: "/fr/confidentialite",
    namespace: "Privacy",
    lastModified: "2026-08-15",
    priority: 0.3,
  },
  {
    key: "cookies",
    en: "/cookies",
    fr: "/fr/cookies",
    namespace: "Cookies",
    lastModified: "2026-08-06",
    priority: 0.3,
  },
] as const satisfies ReadonlyArray<PublicRoute>;

export type PublicRouteKey = (typeof PUBLIC_ROUTES)[number]["key"];

/** All public paths, EN and FR — what the proxy lets through. */
export const PUBLIC_ROUTE_PATHS: ReadonlySet<string> = new Set(
  PUBLIC_ROUTES.flatMap((route) => [route.en, route.fr]),
);

/** The only FR paths, for the proxy rewrite branch. */
const FR_TO_EN = new Map<string, string>(
  PUBLIC_ROUTES.map((route) => [route.fr, route.en]),
);

/** English path equivalent to a public French URL, or `null`. */
export function englishPathForFrench(pathname: string): string | null {
  return FR_TO_EN.get(pathname) ?? null;
}

const BY_PATH = new Map<string, PublicRoute>(
  PUBLIC_ROUTES.flatMap((route) => [
    [route.en, route as PublicRoute],
    [route.fr, route as PublicRoute],
  ]),
);

/** The table entry that serves this path (EN or FR), or `null`. */
export function routeByPath(pathname: string): PublicRoute | null {
  return BY_PATH.get(pathname) ?? null;
}

const BY_KEY = new Map<string, PublicRoute>(
  PUBLIC_ROUTES.map((route) => [route.key, route as PublicRoute]),
);

export function routeByKey(key: PublicRouteKey): PublicRoute {
  const route = BY_KEY.get(key);
  // The key comes from a literal type: this case can only occur in pure JS.
  if (!route) throw new Error(`Unknown public route: ${key}`);
  return route;
}

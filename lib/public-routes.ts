/**
 * Table of public pages on the site (MIN-88) — the only one.
 *
 * Four things needed to know this list, and each had its own copy: the proxy (what to let pass without a session), the sitemap, the
 * metadata for each page, and the navigation links and footer. Four
 * lists that desynchronize on first page addition. They read
 * now this one.
 *
 * **Localized URLs, canonical English.** English lives at the root. Every other
 * locale has translated slugs under its language prefix. One URL represents one
 * language, which gives search engines stable,
 * independently measurable content instead of cookie-dependent variants.
 *
 * There are no duplicate locale route files: the proxy rewrites a localized
 * path to its canonical English route and sets `x-minddy-locale`, which
 * `i18n/request.ts` reads. One page implementation serves every explicit URL.
 *
 * The internal app (behind the authentication) does NOT follow this model: it
 * stays on the `NEXT_LOCALE` cookie. Its URLs do not have to be indexed, so
 * nothing requires them to be split.
 */

/**
 * `lastModified` is the only one of the three sitemap fields that Google actually reads
 * (`priority` and `changeFrequency` have been ignored for a long time;
 * Bing still considers them): it is the signal that triggers another crawler
 * pass. It is therefore maintained by hand, page by page. A build date updated
 * on every deployment would claim that everything changed every time, and
 * search engines quickly learn to ignore it. Update it when page content
 * changes, not on every deployment.
 */
import { CHANGELOG_LAST_MODIFIED } from "@/lib/changelog";
import type { Namespace } from "@/lib/i18n-keys";
import { locales, type Locale } from "@/i18n/config";

export interface PublicRoute {
  /** Stable key, used by `publicPageMetadata` and links. */
  key: string;
  /** Canonical English URL. */
  en: string;
  /** French URL. */
  fr: string;
  /** Explicit paths for locales other than English and French. */
  localized: Record<Exclude<Locale, "en" | "fr">, string>;
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
    localized: { de: "/de", "pt-BR": "/pt-br", it: "/it", es: "/es" },
    namespace: "Landing",
    titleIsAbsolute: true,
    lastModified: "2026-08-27",
    priority: 1,
  },
  {
    key: "pricing",
    en: "/pricing",
    fr: "/fr/tarifs",
    localized: {
      de: "/de/preise",
      "pt-BR": "/pt-br/precos",
      it: "/it/prezzi",
      es: "/es/precios",
    },
    namespace: "Pricing",
    lastModified: "2026-08-27",
    priority: 0.8,
  },
  {
    key: "mcp",
    en: "/mcp",
    fr: "/fr/mcp",
    localized: {
      de: "/de/mcp",
      "pt-BR": "/pt-br/mcp",
      it: "/it/mcp",
      es: "/es/mcp",
    },
    namespace: "Mcp",
    lastModified: "2026-08-27",
    priority: 0.9,
  },
  {
    key: "selfHosting",
    en: "/self-hosting",
    fr: "/fr/auto-hebergement",
    localized: {
      de: "/de/selbst-hosten",
      "pt-BR": "/pt-br/auto-hospedagem",
      it: "/it/hosting-autonomo",
      es: "/es/autoalojamiento",
    },
    namespace: "SelfHosting",
    lastModified: "2026-08-27",
    priority: 0.7,
  },
  // The installation wizard. A tool page rather than an argument page: it is
  // listed so the proxy serves it (sessionless, FR rewrite) and the metadata
  // factory can title it, but it carries a lower weight than the guide above,
  // which is the page engines should land on.
  {
    key: "selfHostingInstall",
    en: "/self-hosting/install",
    fr: "/fr/auto-hebergement/installer",
    localized: {
      de: "/de/selbst-hosten/installieren",
      "pt-BR": "/pt-br/auto-hospedagem/instalar",
      it: "/it/hosting-autonomo/installa",
      es: "/es/autoalojamiento/instalar",
    },
    namespace: "SelfHostingInstall",
    lastModified: "2026-08-21",
    priority: 0.5,
  },
  // Platform hub for the native desktop apps and installable mobile PWA.
  {
    key: "download",
    en: "/download",
    fr: "/fr/telecharger",
    localized: {
      de: "/de/herunterladen",
      "pt-BR": "/pt-br/baixar",
      it: "/it/scarica",
      es: "/es/descargar",
    },
    namespace: "Download",
    lastModified: "2026-08-27",
    priority: 0.9,
  },
  {
    key: "downloadMobile",
    en: "/download/mobile-pwa",
    fr: "/fr/telecharger/pwa-mobile",
    localized: {
      de: "/de/herunterladen/mobile-pwa",
      "pt-BR": "/pt-br/baixar/pwa-movel",
      it: "/it/scarica/pwa-mobile",
      es: "/es/descargar/pwa-movil",
    },
    namespace: "DownloadMobile",
    lastModified: "2026-08-27",
    priority: 0.8,
  },
  // Only page whose `lastModified` is NOT hand-held: here,
  // “content has changed” and “an entry has been added” are the same
  // event, and freshness is what Perplexity looks at first.
  {
    key: "changelog",
    en: "/changelog",
    fr: "/fr/nouveautes",
    localized: {
      de: "/de/neuigkeiten",
      "pt-BR": "/pt-br/novidades",
      it: "/it/novita",
      es: "/es/novedades",
    },
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
    localized: {
      de: "/de/alternativen/linear",
      "pt-BR": "/pt-br/alternativas/linear",
      it: "/it/alternative/linear",
      es: "/es/alternativas/linear",
    },
    namespace: "AlternativeLinear",
    lastModified: "2026-09-05",
    priority: 0.7,
  },
  {
    key: "alternativeJira",
    en: "/alternatives/jira",
    fr: "/fr/alternatives/jira",
    localized: {
      de: "/de/alternativen/jira",
      "pt-BR": "/pt-br/alternativas/jira",
      it: "/it/alternative/jira",
      es: "/es/alternativas/jira",
    },
    namespace: "AlternativeJira",
    lastModified: "2026-09-05",
    priority: 0.7,
  },
  {
    key: "alternativeNotion",
    en: "/alternatives/notion",
    fr: "/fr/alternatives/notion",
    localized: {
      de: "/de/alternativen/notion",
      "pt-BR": "/pt-br/alternativas/notion",
      it: "/it/alternative/notion",
      es: "/es/alternativas/notion",
    },
    namespace: "AlternativeNotion",
    lastModified: "2026-09-05",
    priority: 0.7,
  },
  {
    key: "legal",
    en: "/legal",
    fr: "/fr/mentions-legales",
    localized: {
      de: "/de/impressum",
      "pt-BR": "/pt-br/aviso-legal",
      it: "/it/note-legali",
      es: "/es/aviso-legal",
    },
    namespace: "Legal",
    lastModified: "2026-07-23",
    priority: 0.3,
  },
  {
    key: "terms",
    en: "/terms",
    fr: "/fr/cgu",
    localized: {
      de: "/de/nutzungsbedingungen",
      "pt-BR": "/pt-br/termos",
      it: "/it/termini",
      es: "/es/terminos",
    },
    namespace: "Terms",
    lastModified: "2026-08-05",
    priority: 0.3,
  },
  {
    key: "privacy",
    en: "/privacy",
    fr: "/fr/confidentialite",
    localized: {
      de: "/de/datenschutz",
      "pt-BR": "/pt-br/privacidade",
      it: "/it/privacy",
      es: "/es/privacidad",
    },
    namespace: "Privacy",
    lastModified: "2026-08-15",
    priority: 0.3,
  },
  {
    key: "cookies",
    en: "/cookies",
    fr: "/fr/cookies",
    localized: {
      de: "/de/cookies",
      "pt-BR": "/pt-br/cookies",
      it: "/it/cookie",
      es: "/es/cookies",
    },
    namespace: "Cookies",
    lastModified: "2026-08-06",
    priority: 0.3,
  },
] as const satisfies ReadonlyArray<PublicRoute>;

export type PublicRouteKey = (typeof PUBLIC_ROUTES)[number]["key"];

export interface PublicRouteVariant {
  locale: Locale;
  path: string;
}

/** Explicit, independently indexable locale variants for a public page. */
export function publicRouteVariants(
  route: PublicRoute,
): readonly PublicRouteVariant[] {
  return locales.flatMap((locale) => {
    const path = explicitPublicPathForLocale(route, locale);
    return path ? [{ locale, path }] : [];
  });
}

/** Localized path for every supported product locale. */
export function publicPathForLocale(
  route: PublicRoute,
  locale: Locale,
): string {
  return explicitPublicPathForLocale(route, locale);
}

function explicitPublicPathForLocale(
  route: PublicRoute,
  locale: Locale,
): string {
  if (locale === "en") return route.en;
  if (locale === "fr") return route.fr;
  return route.localized[locale];
}

/** All explicit public locale paths — what the proxy lets through. */
export const PUBLIC_ROUTE_PATHS: ReadonlySet<string> = new Set(
  PUBLIC_ROUTES.flatMap((route) =>
    publicRouteVariants(route).map(({ path }) => path),
  ),
);

/** The only FR paths, for the proxy rewrite branch. */
const FR_TO_EN = new Map<string, string>(
  PUBLIC_ROUTES.map((route) => [route.fr, route.en]),
);

/** English path equivalent to a public French URL, or `null`. */
export function englishPathForFrench(pathname: string): string | null {
  return FR_TO_EN.get(pathname) ?? null;
}

const PATH_TO_VARIANT = new Map<string, { route: PublicRoute; locale: Locale }>(
  PUBLIC_ROUTES.flatMap((route) =>
    publicRouteVariants(route).map(
      ({ path, locale }) => [path, { route, locale }] as const,
    ),
  ),
);

/** Locale declared by an explicit public URL, or `null` for a non-public path. */
export function localeForPublicPath(pathname: string): Locale | null {
  return PATH_TO_VARIANT.get(pathname)?.locale ?? null;
}

const BY_PATH = new Map<string, PublicRoute>(
  [...PATH_TO_VARIANT].map(([path, { route }]) => [path, route]),
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

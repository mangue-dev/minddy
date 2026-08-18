import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { locales, type Locale } from "@/i18n/config";
import { routeByKey, type PublicRouteKey } from "@/lib/public-routes";
import { SITE_URL } from "@/lib/site";

/**
 * Metadata factory for public pages (MIN-88).
 *
 * A single place that knows how to place a tag. Before, each page composed its own
 * by hand: the landing and the prices declared `canonical` +
 * `openGraph`, the four legal pages only included one `title` — therefore no
 * description, no canonical, and no sharing sticker (Next does derive
 * `twitter:*` from `openGraph`, but it cannot derive anything that doesn't exist).
 *
 * What it produces, for any public page and in both languages :
 * `title`, `description`, `canonical`, the three `hreflang` (`en`, `fr`,
 * `x-default`), the complete `openGraph` block and the explicit `twitter` block.
 *
 * `x-default` points to English: this is the version served to those who have not expressed a preference, and the only one that exists for all pages.
 */

const OG_LOCALE: Record<Locale, string> = { en: "en_US", fr: "fr_FR" };

/**
 * Sharing block of a public page without a dedicated thumbnail (MIN-95).
 *
 * Any page that declares its own `openGraph` must declare it COMPLETE: Next
 * replaces the parent's object, it does not merge it field by field. Without that,
 * a page which would only have had its title left with the `og:description` of
 * the landing.
 *
 * No image: the `/og` route can only render the six pages of the site public,
 * and sticking a generic minddy sticker on a customer's board would be a contradiction in terms. A `summary` card without an image displays title and description — this
 * which is exactly what it says.
 */
export function socialMetadata({
  title,
  description,
  url,
  locale,
}: {
  title: string;
  description: string;
  /** URL (absolute or relative to `metadataBase`) of the page. */
  url?: string;
  locale: Locale;
}): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: "minddy",
      locale: OG_LOCALE[locale],
      ...(url ? { url } : {}),
      title,
      description,
    },
    twitter: { card: "summary", title, description },
  };
}

/**
 * Metadata of public token pages (MIN-95) — feedback board
 * `/f/<token>` and its subpages, shared view `/share/<token>`.
 *
 * These pages remain `noindex`: their URL IS permission, it has nothing to
 * do in an index. But they are made to be STICKED — in a
 * Slack, an email, a message — and a link preview reads `og:*`, not `robots`.
 * Without their own OpenGraph block, they inherited that of the root layout: all
 * all clients' boards noticed “minddy — A minimal issue
 * tracker”.
 */
export function publicTokenMetadata({
  title,
  description,
  canonical,
  locale,
}: {
  title: string;
  description: string;
  /** Authentic absolute URL, when the page also responds on a client domain. */
  canonical?: string;
  locale: Locale;
}): Metadata {
  return {
    title,
    description,
    ...(canonical ? { alternates: { canonical } } : {}),
    ...socialMetadata({ title, description, url: canonical, locale }),
    robots: { index: false, follow: false },
  };
}

/**
 * Cuts free text into a description of reasonable length — engines
 * and link previews truncate around 160 characters, so we might as well decide
 * ourselves where the sentence stops. Cut on a word, never in the middle.
 */
export function metaExcerpt(raw: string, max = 160): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Absolute URL of a page's sharing thumbnail, in its language. */
export function ogImageUrl(routeKey: PublicRouteKey, locale: Locale): string {
  return `${SITE_URL}/og?route=${routeKey}&locale=${locale}`;
}

export async function publicPageMetadata({
  routeKey,
  locale,
}: {
  routeKey: PublicRouteKey;
  locale: Locale;
}): Promise<Metadata> {
  const route = routeByKey(routeKey);
  const t = await getTranslations({ locale, namespace: route.namespace });

  const title = t("metaTitle");
  const description = t("metaDescription");
  const path = locale === "fr" ? route.fr : route.en;
  const image = ogImageUrl(routeKey, locale);

  // `languages` must list ALL variants, including the one on the page
  // common: a hreflang that does not reference itself is reported as
  // "missing return" by Search Console, and the group is ignored.
  const languages: Record<string, string> = {
    en: route.en,
    fr: route.fr,
    "x-default": route.en,
  };

  return {
    title: route.titleIsAbsolute ? { absolute: title } : title,
    description,
    alternates: { canonical: path, languages },
    openGraph: {
      type: "website",
      siteName: "minddy",
      locale: OG_LOCALE[locale],
      alternateLocale: locales.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      url: path,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

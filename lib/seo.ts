import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { locales, type Locale } from "@/i18n/config";
import { routeByKey, type PublicRouteKey } from "@/lib/public-routes";
import { SITE_URL } from "@/lib/site";

/**
 * Fabrique de métadonnées des pages publiques (MIN-88).
 *
 * Un seul endroit qui sait poser une balise. Avant, chaque page composait les
 * siennes à la main : la landing et les tarifs déclaraient `canonical` +
 * `openGraph`, les quatre pages légales ne posaient qu'un `title` — donc pas de
 * description, pas de canonical, et pas de vignette de partage (Next dérive bien
 * `twitter:*` d'`openGraph`, mais il ne peut rien dériver de ce qui n'existe
 * pas).
 *
 * Ce que ça produit, pour toute page publique et dans les deux langues :
 * `title`, `description`, `canonical`, les trois `hreflang` (`en`, `fr`,
 * `x-default`), le bloc `openGraph` complet et le bloc `twitter` explicite.
 *
 * `x-default` pointe sur l'anglais : c'est la version servie à qui n'a pas
 * exprimé de préférence, et la seule qui existe pour toutes les pages.
 */

const OG_LOCALE: Record<Locale, string> = { en: "en_US", fr: "fr_FR" };

/** URL absolue de la vignette de partage d'une page, dans sa langue. */
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

  // `languages` doit lister TOUTES les variantes, y compris celle de la page
  // courante : un hreflang qui ne se référence pas lui-même est signalé comme
  // « retour manquant » par Search Console, et le groupe est ignoré.
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

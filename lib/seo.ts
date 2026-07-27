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

/**
 * Bloc de partage d'une page publique sans vignette dédiée (MIN-95).
 *
 * Toute page qui déclare son propre `openGraph` doit le déclarer COMPLET : Next
 * remplace l'objet du parent, il ne le fusionne pas champ par champ. Sans ça,
 * une page qui n'aurait posé que son titre repartait avec l'`og:description` de
 * la landing.
 *
 * Pas d'image : la route `/og` ne sait rendre que les six pages du site public,
 * et coller une vignette minddy générique sur le board d'un client serait à
 * contresens. Une carte `summary` sans image affiche titre et description — ce
 * qui est exactement ce qu'on a à dire.
 */
export function socialMetadata({
  title,
  description,
  url,
  locale,
}: {
  title: string;
  description: string;
  /** URL (absolue ou relative à `metadataBase`) de la page. */
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
 * Métadonnées des pages publiques à token (MIN-95) — board de feedback
 * `/f/<token>` et ses sous-pages, vue partagée `/share/<token>`.
 *
 * Ces pages restent `noindex` : leur URL EST l'autorisation, elle n'a rien à
 * faire dans un index. Mais elles sont faites pour être COLLÉES — dans un
 * Slack, un mail, un message — et un aperçu de lien lit `og:*`, pas `robots`.
 * Sans bloc OpenGraph propre, elles héritaient de celui du root layout : tous
 * les boards de tous les clients s'aperçevaient « minddy — A minimal issue
 * tracker ».
 */
export function publicTokenMetadata({
  title,
  description,
  canonical,
  locale,
}: {
  title: string;
  description: string;
  /** URL absolue faisant foi, quand la page répond aussi sur un domaine client. */
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
 * Coupe un texte libre en une description de longueur raisonnable — les moteurs
 * et les aperçus de lien tronquent autour de 160 caractères, autant décider
 * nous-mêmes où la phrase s'arrête. Coupe sur un mot, jamais au milieu.
 */
export function metaExcerpt(raw: string, max = 160): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

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

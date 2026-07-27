import { defaultLocale, type Locale } from "@/i18n/config";

/**
 * L'adresse du flux du changelog (MIN-93), au même endroit pour tout le monde :
 * la page qui l'annonce dans son `<head>`, le lien « Suivre en RSS », le
 * `robots.txt` et la route qui le sert.
 *
 * Une SEULE route, en anglais, avec la langue en paramètre : `/fr/nouveautes`
 * est bien une URL réécrite par le proxy, mais la réécriture porte sur des
 * chemins exacts (`lib/public-routes.ts`) — `/fr/nouveautes/rss.xml` n'en est
 * pas un et tomberait en 404. Un paramètre coûte moins qu'une deuxième route
 * publique à déclarer partout.
 */
export const CHANGELOG_FEED_PATH = "/changelog/rss.xml";

export function changelogFeedPath(locale: Locale): string {
  return locale === defaultLocale
    ? CHANGELOG_FEED_PATH
    : `${CHANGELOG_FEED_PATH}?locale=${locale}`;
}

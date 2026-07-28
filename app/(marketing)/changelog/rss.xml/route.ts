import type { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { CHANGELOG_ENTRIES } from "@/lib/changelog";
import { CHANGELOG_FEED_PATH, changelogFeedStylePath } from "@/lib/changelog-feed";
import { routeByKey } from "@/lib/public-routes";
import { SITE_URL } from "@/lib/site";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * Le flux RSS du changelog (MIN-93).
 *
 * Un flux n'a plus grand-chose d'un canal grand public, mais il reste ce que
 * suivent les agrégateurs, les robots de veille et une partie des crawlers :
 * c'est le format qui dit « cette page bouge, voilà quand », sans qu'on ait à
 * la recrawler pour le découvrir.
 *
 * Route dans le groupe `(marketing)` : un route handler n'y rend aucun layout,
 * mais le fichier reste à côté de la page qu'il double. La langue arrive en
 * paramètre — voir `lib/changelog-feed.ts`.
 *
 * Le corps est échappé à la main : les titres et les textes viennent des
 * catalogues de traduction, et un `&` ou une apostrophe typographique suffit à
 * rendre un XML invalide — auquel cas le lecteur n'affiche RIEN, sans le dire.
 */

export async function GET(request: NextRequest): Promise<Response> {
  const raw = request.nextUrl.searchParams.get("locale") ?? "";
  const locale = ((locales as readonly string[]).includes(raw) ? raw : defaultLocale) as Locale;

  const t = await getTranslations({ locale, namespace: "Changelog" });
  const route = routeByKey("changelog");
  const pageUrl = `${SITE_URL}${locale === "fr" ? route.fr : route.en}`;
  const feedUrl = `${SITE_URL}${CHANGELOG_FEED_PATH}${locale === defaultLocale ? "" : `?locale=${locale}`}`;

  const items = CHANGELOG_ENTRIES.map((entry) =>
    [
      "    <item>",
      `      <title>${escapeXml(t(`entry_${entry.id}_title` as MessageKey<"Changelog">))}</title>`,
      `      <link>${escapeXml(`${pageUrl}#${entry.id}`)}</link>`,
      // `isPermaLink="false"` : le guid est l'identifiant stable de l'entrée,
      // pas une URL. Sans ça, changer d'ancre republierait toute la liste.
      `      <guid isPermaLink="false">minddy:changelog:${entry.id}</guid>`,
      `      <pubDate>${rfc822(entry.date)}</pubDate>`,
      `      <description>${escapeXml(t(`entry_${entry.id}_body` as MessageKey<"Changelog">))}</description>`,
      "    </item>",
    ].join("\n"),
  ).join("\n");

  // L'instruction de style, juste après la déclaration XML : c'est elle qui
  // fait qu'un navigateur affiche une page lisible au lieu d'un arbre XML brut.
  // Les lecteurs de flux l'ignorent — voir `rss.css/route.ts` pour le choix du
  // CSS plutôt que du XSLT.
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/css" href="${escapeXml(changelogFeedStylePath(locale))}"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>minddy · ${escapeXml(t("metaTitle"))}</title>
    <link>${escapeXml(pageUrl)}</link>
    <description>${escapeXml(t("metaDescription"))}</description>
    <language>${locale === "fr" ? "fr-fr" : "en-us"}</language>
    <lastBuildDate>${rfc822(CHANGELOG_ENTRIES[0].date)}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: {
      // `text/xml` et non `application/rss+xml`, qui est pourtant le type
      // canonique d'un flux RSS. Mesuré dans Chromium : sur
      // `application/rss+xml`, le navigateur ne lance PAS son parseur XML — il
      // enveloppe la réponse dans une page HTML et l'affiche telle quelle
      // (`document.documentElement` vaut `HTML`, zéro feuille de style
      // chargée). L'instruction de style ci-dessus n'est donc jamais lue, et le
      // visiteur voit du balisage brut. Sur `text/xml` comme sur
      // `application/xml`, le document est parsé en XML et la feuille
      // s'applique.
      //
      // Aucune perte côté lecteurs de flux : ils reconnaissent un flux à son
      // contenu, `text/xml` est répandu, et la découverte automatique se fait
      // par le `<link rel="alternate" type="application/rss+xml">` du `<head>`
      // de la page, qui lui garde le type canonique.
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

/** Date ISO courte → date RFC 822, la seule que RSS 2.0 accepte. */
function rfc822(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toUTCString();
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

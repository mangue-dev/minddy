import type { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { getChangelogIndex, getChangelogRelease } from "@/lib/server/changelog";
import { CHANGELOG_FEED_PATH, changelogFeedStylePath } from "@/lib/changelog-feed";
import { publicPathForLocale, routeByKey } from "@/lib/public-routes";
import { SITE_URL } from "@/lib/site";

/** RSS announces versions using their confirmed production publication timestamps. */
export async function GET(request: NextRequest): Promise<Response> {
  const raw = request.nextUrl.searchParams.get("locale") ?? "";
  const locale = ((locales as readonly string[]).includes(raw) ? raw : defaultLocale) as Locale;
  const t = await getTranslations({ locale, namespace: "Changelog" });
  const pageUrl = `${SITE_URL}${publicPathForLocale(routeByKey("changelog"), locale)}`;
  const feedUrl = `${SITE_URL}${CHANGELOG_FEED_PATH}${locale === defaultLocale ? "" : `?locale=${locale}`}`;
  const index = (await getChangelogIndex()).slice(0, 50);
  const releases = await Promise.all(index.map(r => getChangelogRelease(r.version)));
  const items = index.map((entry, i) => {
    const release = releases[i];
    const description = [entry.copy[locale].summary, ...(release?.features.map(f =>
      `${f.copy[locale].title}: ${f.copy[locale].details.join(" ")}`) ?? [])].join("\n\n");
    return [
      "    <item>",
      `      <title>${escapeXml(`v${entry.version} · ${entry.copy[locale].title}`)}</title>`,
      `      <link>${escapeXml(`${pageUrl}#v${entry.version.replaceAll(".", "-")}`)}</link>`,
      `      <guid isPermaLink="false">minddy:release:${entry.version}</guid>`,
      `      <pubDate>${new Date(entry.publishedAt).toUTCString()}</pubDate>`,
      `      <description>${escapeXml(description)}</description>`,
      "    </item>",
    ].join("\n");
  }).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/css" href="${escapeXml(changelogFeedStylePath(locale))}"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>minddy · ${escapeXml(t("metaTitle"))}</title>
    <link>${escapeXml(pageUrl)}</link>
    <description>${escapeXml(t("metaDescription"))}</description>
    <language>${RSS_LANGUAGE[locale]}</language>
    <lastBuildDate>${new Date(index[0].publishedAt).toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
  return new Response(body, { headers: {
    // Browsers apply the feed stylesheet only when they parse the response as XML.
    "Content-Type": "text/xml; charset=utf-8",
    "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
  } });
}
const RSS_LANGUAGE: Record<Locale, string> = {
  en: "en-us", fr: "fr-fr", de: "de-de", "pt-BR": "pt-br", it: "it-it", es: "es-es",
};
function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

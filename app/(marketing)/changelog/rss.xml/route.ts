import type { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { CHANGELOG_ENTRIES } from "@/lib/changelog";
import { CHANGELOG_FEED_PATH, changelogFeedStylePath } from "@/lib/changelog-feed";
import { routeByKey } from "@/lib/public-routes";
import { SITE_URL } from "@/lib/site";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * The changelog RSS feed (MIN-93).
 *
 * An RSS feed is no longer much of a public channel, but it remains what
 * aggregators, monitoring robots, and some crawlers follow:
 * it’s the format that says “this page moves, that’s when”, without us having to
 * recrawl it to find out.
 *
 * Route in the `(marketing)` group: a route handler does not render any layout there,
 * but the file remains next to the page it duplicates. The language arrives in
 * parameter — see `lib/changelog-feed.ts`.
 *
 * The body has escaped from the hand: the titles and texts come from
 * translation catalogs, and a `&` or a typographical apostrophe is enough to
 * render an XML invalid — in which case the reader displays NOTHING, without saying so.
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
      // `isPermaLink="false"`: the guid is the stable identifier of the entry,
      // not a URL. Otherwise, changing anchors would republish the entire list.
      `      <guid isPermaLink="false">minddy:changelog:${entry.id}</guid>`,
      `      <pubDate>${rfc822(entry.date)}</pubDate>`,
      `      <description>${escapeXml(t(`entry_${entry.id}_body` as MessageKey<"Changelog">))}</description>`,
      "    </item>",
    ].join("\n"),
  ).join("\n");

  // The style instruction, just after the XML declaration: this is what
  // causes a browser to display a readable page instead of a raw XML tree.
  // Feed readers ignore it — see `rss.css/route.ts` for choice of
  // CSS rather than XSLT.
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
      // `text/xml` and not `application/rss+xml`, which is nevertheless the type
      // canonical of an RSS feed. Measured in Chromium: on
      // `application/rss+xml`, the browser does NOT launch its XML parser — it
      // wraps the response in an HTML page and displays it as is
      // (`document.documentElement` is `HTML`, zero style sheets
      // loaded). The style statement above is therefore never read, and the
      // visitor sees raw markup. On `text/xml` as on
      // `application/xml`, the document is parsed in XML and the sheet
      // s'applique.
      //
      // No loss on the stream reader side: they recognize a stream by its
      // content, `text/xml` is widespread, and automatic discovery is done
      // by the `<link rel="alternate" type="application/rss+xml">` of the `<head>`
      // of the page, which keeps the canonical type.
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

/** Short ISO date → RFC 822 date, the only one that RSS 2.0 accepts. */
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

import type { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { defaultLocale, locales, type Locale } from "@/i18n/config";

/**
 * The RSS feed style sheet (MIN-93) — so that “Follow in RSS” does not open
 * not a wall of XML.
 *
 * ## Why CSS and not XSLT
 *
 * Dressing a flow is traditionally done in XSLT, and that's what
 * most blogs. Except that Chrome announced in October 2025 the DELETION
 * of XSLT: depreciation in Chrome 143, stop on stable versions at
 * November 17, 2026 — Firefox and WebKit said they would follow. Write a
 * XSLT sheet today is writing something that breaks in a few
 * mois.
 *
 * The CSS applied to an XML document is not concerned: it is another
 * mechanism (we style the XML tree as is, without a transformation engine).
 *
 * ## What it allows, and what it does not allow
 *
 * We CAN hide, visually reorder, type, and place text in
 * `::before`. We CANNOT transform the tree or make an RSS `<link>`
 * clickable: in a flow it is a text node, not an HTML anchor. Hence the
 * banner that explains what to do with the address rather than a button.
 *
 * The flow remains a flow: a reader simply ignores
 * clickable: in a feed it is a processing instruction pointing here.
 */

export async function GET(request: NextRequest): Promise<Response> {
  const raw = request.nextUrl.searchParams.get("locale") ?? "";
  const locale = ((locales as readonly string[]).includes(raw) ? raw : defaultLocale) as Locale;
  const t = await getTranslations({ locale, namespace: "Changelog" });

  const body = `/* minddy · changelog feed styling. */

/* Everything is hidden by default: a feed carries nodes that make no sense on
   screen (guid, locale, build date, the Atom link to itself), and listing them
   one by one would require coming back here whenever a field is added. */
* {
  display: none;
}

rss,
channel,
item {
  display: block;
}

rss {
  --bg: #ffffff;
  --fg: #101114;
  --muted: #6b7280;
  --line: #e5e7eb;
  --accent: #f4f4f5;
  background: var(--bg);
  color: var(--fg);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 16px;
  line-height: 1.6;
}

@media (prefers-color-scheme: dark) {
  rss {
    --bg: #0d0e10;
    --fg: #fafafa;
    --muted: #9ca3af;
    --line: #26272b;
    --accent: #17181b;
  }
}

channel {
  max-width: 42rem;
  margin: 0 auto;
  padding: 3rem 1.25rem 4rem;
}

/* The banner: the only thing a curious visitor who arrives here needs to read.
   It is placed in ::before because it does not exist in any feed node, and it
   must not exist there: it would be noise for feed readers. */
channel::before {
  content: ${cssString(t("feedBannerTitle"))} "\\A" ${cssString(t("feedBannerBody"))};
  white-space: pre-line;
  display: block;
  margin-bottom: 2.5rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--line);
  border-radius: 0.875rem;
  background: var(--accent);
  color: var(--muted);
  font-size: 0.875rem;
}

channel > title {
  display: block;
  font-size: 1.875rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

channel > description {
  display: block;
  margin-top: 0.5rem;
  color: var(--muted);
}

item {
  border-top: 1px solid var(--line);
  margin-top: 2rem;
  padding-top: 2rem;
}

item > pubDate {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
}

item > title {
  display: block;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

item > description {
  display: block;
  margin-top: 0.5rem;
  color: var(--muted);
}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

/**
 * A CSS string enclosed in quotes. The text comes from the translation catalog:
 * a straight quote or a backslash would be enough to break the rule, and a
 * Broken rule is not visible — it is simply ignored.
 */
function cssString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

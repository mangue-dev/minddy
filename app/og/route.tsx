import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";
import { getClientIp } from "@/lib/server/request-ip";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import { MINDDY_LOGO_PATH, MINDDY_LOGO_VIEWBOX } from "@/lib/brand";
import { locales, defaultLocale, type Locale } from "@/i18n/config";
import { PUBLIC_ROUTES, routeByKey, type PublicRouteKey } from "@/lib/public-routes";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * Public site sharing thumbnail (MIN-88) — what you see when a link
 * minddy is stuck in Slack, it inevitable: it only covered the segment
 * `(marketing)` (the legal and `/login` pages therefore had NO thumbnail),
 * it was frozen in English, and its title was a manual copy of
 * `en.Landing.metaTitle` — outside the i18n catalog, therefore out of reach of a
 * copy audit, and already out of sync.
 *
 * A parameterized route sets all three: `?route=<key>&locale=<language>` reads the
 * texts in `messages/<language>.json`, for any public page and
 * in both languages. `lib/seo.ts` is the only caller.
 *
 * Deliberately sober: the brand, the promise, nothing else.
 */

export const contentType = "image/png";

const SIZE = { width: 1200, height: 630 };

const ROUTE_KEYS = new Set<string>(PUBLIC_ROUTES.map((route) => route.key));

function parseParams(request: NextRequest): { key: PublicRouteKey; locale: Locale } {
  const params = request.nextUrl.searchParams;
  const rawKey = params.get("route") ?? "";
  const rawLocale = params.get("locale") ?? "";
  return {
    // Public parameters, therefore arbitrary: we return to the landing in
    // English rather than rendering an error image in a link preview.
    key: (ROUTE_KEYS.has(rawKey) ? rawKey : "home") as PublicRouteKey,
    locale: ((locales as readonly string[]).includes(rawLocale)
      ? rawLocale
      : defaultLocale) as Locale,
  };
}

/**
 * How many thumbnails a single IP address can RENDER per minute.
 *
 * The satori rendering of a 1200x630 PNG is, by far, the most expensive calculation that
 * This app offers no authentication. The bound is high because
 * legitimate scrapers (Slack, X, an email client) type in bursts on the
 * twelve canonical addresses — but it exists, which was not the case.
 */
const OG_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const { key, locale } = parseParams(request);
  const route = routeByKey(key);

  // The CACHE KEY, first (MIN-348). The content depends only on two
  // parameters, but the CDN indexes on the entire URL: `?route=home&x=1`,
  // `&x=2`, `&x=3`… are as many new entries, therefore as many renderings. A
  // non-canonical address is therefore returned to the canonical — 308, without
  // render the image — and there are only a dozen URLs left to render for everything
  // the site. The limiter below only keeps these twelve.
  const canonical = `route=${key}&locale=${locale}`;
  if (request.nextUrl.search.replace(/^\?/, "") !== canonical) {
    const target = new URL(request.nextUrl);
    target.search = canonical;
    return NextResponse.redirect(target, {
      status: 308,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    });
  }

  const refused = rateLimitRefusal(`ip:${getClientIp(request)}`, "og", OG_RATE_LIMIT);
  if (refused) return refused;

  const messages = (await import(`../../messages/${locale}.json`)).default as Record<
    string,
    Record<string, string>
  >;
  const namespace = messages[route.namespace] ?? {};
  const title = namespace.metaTitle ?? SITE_NAME;
  const description = namespace.metaDescription ?? "";
  const siteHost = new URL(SITE_URL).host;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0d0e10",
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width={72} height={72} viewBox={MINDDY_LOGO_VIEWBOX} fill="#fafafa">
            <path fillRule="evenodd" clipRule="evenodd" d={MINDDY_LOGO_PATH} />
          </svg>
          <span style={{ fontSize: 52, fontWeight: 600, color: "#fafafa", letterSpacing: -1.5 }}>
            {SITE_NAME}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <span
            style={{
              fontSize: 68,
              fontWeight: 600,
              color: "#fafafa",
              letterSpacing: -2.5,
              lineHeight: 1.1,
              maxWidth: 900,
            }}
          >
            {title}
          </span>
          <span style={{ fontSize: 30, color: "#9ca3af", maxWidth: 820, lineHeight: 1.4 }}>
            {description}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 3, background: "#3098D0" }} />
          <span style={{ fontSize: 26, color: "#6b7280" }}>{siteHost}</span>
        </div>
      </div>
    ),
    {
      ...SIZE,
      headers: {
        // The content only depends on the two URL parameters: once rendered,
        // the thumbnail can remain for a long time in the CDN and with scrapers.
        "Cache-Control": "public, max-age=3600, s-maxage=86400, immutable",
      },
    },
  );
}

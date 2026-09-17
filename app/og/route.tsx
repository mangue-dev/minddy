import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";
import { getClientIp } from "@/lib/server/request-ip";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import { MINDDY_LOGO_PATH, MINDDY_LOGO_VIEWBOX } from "@/lib/brand";
import { locales, defaultLocale, type Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import { PUBLIC_ROUTES, routeByKey, type PublicRouteKey } from "@/lib/public-routes";
import { metaExcerpt } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";

/**
 * Public site sharing thumbnail (MIN-88, redesign MIN-512) — what you see when a
 * minddy link is stuck in Slack, X or an email client. A parameterized route
 * renders one image per public page and per language: `?route=<key>&locale=<lang>`
 * reads the texts in `messages/<lang>.json`, so the sticker never drifts from the
 * page copy. `lib/seo.ts` is the only caller.
 *
 * The design borrows the landing's palette instead of inventing one: the pastel
 * surfaces of `components/marketing/card-tones.ts` (sage, lavender, peach, sky)
 * laid over a warm cream, with the brand drawn in ink like the app's `--primary`.
 * Deliberately flat — satori has no blur, and at sticker size the pastel blocks
 * carry more than any detail would.
 */

export const contentType = "image/png";

const SIZE = { width: 1200, height: 630 };

const ROUTE_KEYS = new Set<string>(PUBLIC_ROUTES.map((route) => route.key));

function parseParams(request: NextRequest): { key: PublicRouteKey; locale: Locale } {
  const params = request.nextUrl.searchParams;
  const rawKey = params.get("route") ?? "";
  const rawLocale = params.get("locale") ?? "";
  return {
    // Public parameters, therefore arbitrary: we fall back to the landing in
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
 * The satori rendering of a 1200x630 PNG is, by far, the most expensive
 * calculation this app offers without authentication. The bound is high because
 * legitimate scrapers (Slack, X, an email client) type in bursts on the
 * eighteen canonical addresses — but it exists, which was not always the case.
 */
const OG_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

/** Warm ink used for every text and the logo, in the spirit of `--primary`. */
const INK = "#26332c";
const MUTED = "#5e6b61";

/**
 * The title is the only variable-height element: metaTitles range from
 * "Legal notice" to a 71-character French sentence. Three sizes, chosen by
 * length, keep the block between one and three lines inside the card for every
 * known catalog entry — a fixed size either wastes the short titles or
 * overflows on the long ones.
 */
function titleFontSize(length: number): number {
  if (length > 56) return 58;
  if (length > 38) return 68;
  return 80;
}

/**
 * Some metaTitles open with the brand — "minddy: open-source project
 * management…" — which the wordmark in the header already says. Drop that
 * leading "<name>:" (French spacing included) so the headline starts on its
 * substance; titles where the brand is part of the sentence ("minddy Cloud
 * pricing…", "minddy pour macOS") keep it.
 */
function headlineOf(title: string): string {
  const brand = SITE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return title.replace(new RegExp(`^${brand}\\s*:\\s*`, "i"), "");
}

export async function GET(request: NextRequest) {
  const { key, locale } = parseParams(request);
  const route = routeByKey(key);

  // The CACHE KEY, first (MIN-348). The content depends only on two
  // parameters, but the CDN indexes on the entire URL: `?route=home&x=1`,
  // `&x=2`, `&x=3`… are as many new entries, therefore as many renderings. A
  // non-canonical address is therefore returned to the canonical — 308, without
  // rendering the image — and there are only about twenty URLs left to render
  // for the whole site. The limiter below only keeps these.
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

  const messages = await loadMessages(locale) as Record<string, Record<string, string>>;
  const namespace = messages[route.namespace] ?? {};
  const headline = headlineOf(namespace.metaTitle ?? SITE_NAME);
  const description = metaExcerpt(namespace.metaDescription ?? "");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          overflow: "hidden",
          position: "relative",
          background:
            "linear-gradient(120deg, #f7f3e8 0%, #e4edda 45%, #dde9f4 100%)",
          padding: 80,
        }}
      >
        {/* Pastel shapes cropped by the canvas, echoing the landing's cards
            (components/marketing/card-tones.ts) in deliberately fuller tints
            so the hues survive thumbnail size. First in DOM order: the content
            below paints on top of them. */}
        <div
          style={{
            position: "absolute",
            top: -210,
            right: -170,
            width: 560,
            height: 560,
            borderRadius: 9999,
            background: "#eae0f6",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -210,
            left: -160,
            width: 520,
            height: 520,
            borderRadius: 9999,
            background: "#f5e2c6",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -170,
            right: -130,
            width: 400,
            height: 400,
            borderRadius: 9999,
            background: "#f2d8e2",
            display: "flex",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <svg width={62} height={62} viewBox={MINDDY_LOGO_VIEWBOX} fill={INK}>
              <path fillRule="evenodd" clipRule="evenodd" d={MINDDY_LOGO_PATH} />
            </svg>
            <span style={{ fontSize: 46, color: INK, letterSpacing: -1.5 }}>
              {SITE_NAME}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flexGrow: 1,
              justifyContent: "center",
              gap: 26,
            }}
          >
            <span
              style={{
                fontSize: titleFontSize(headline.length),
                color: INK,
                letterSpacing: -2.2,
                lineHeight: 1.12,
                maxWidth: 1010,
              }}
            >
              {headline}
            </span>
            {description ? (
              <span
                style={{
                  fontSize: 27,
                  color: MUTED,
                  maxWidth: 940,
                  lineHeight: 1.5,
                }}
              >
                {description}
              </span>
            ) : null}
          </div>
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

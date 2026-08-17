import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";
import { getClientIp } from "@/lib/server/request-ip";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import { MINDDY_LOGO_PATH, MINDDY_LOGO_VIEWBOX } from "@/lib/brand";
import { locales, defaultLocale, type Locale } from "@/i18n/config";
import { PUBLIC_ROUTES, routeByKey, type PublicRouteKey } from "@/lib/public-routes";

/**
 * Vignette de partage du site public (MIN-88) — ce qu'on voit quand un lien
 * minddy est collé dans Slack, X ou une conversation.
 *
 * Remplace `app/(marketing)/opengraph-image.tsx`, qui avait trois défauts que
 * la convention de fichier rend inévitables : elle ne couvrait que le segment
 * `(marketing)` (les pages légales et `/login` n'avaient donc AUCUNE vignette),
 * elle était figée en anglais, et son titre était une copie manuelle de
 * `en.Landing.metaTitle` — hors du catalogue i18n, donc hors de portée d'un
 * audit de copy, et déjà désynchronisée.
 *
 * Une route paramétrée règle les trois : `?route=<clé>&locale=<langue>` lit les
 * textes dans `messages/<langue>.json`, pour n'importe quelle page publique et
 * dans les deux langues. `lib/seo.ts` est le seul appelant.
 *
 * Volontairement sobre : la marque, la promesse, rien d'autre.
 */

const SIZE = { width: 1200, height: 630 };

const ROUTE_KEYS = new Set<string>(PUBLIC_ROUTES.map((route) => route.key));

function parseParams(request: NextRequest): { key: PublicRouteKey; locale: Locale } {
  const params = request.nextUrl.searchParams;
  const rawKey = params.get("route") ?? "";
  const rawLocale = params.get("locale") ?? "";
  return {
    // Paramètres publics, donc arbitraires : on retombe sur la landing en
    // anglais plutôt que de rendre une image d'erreur dans un aperçu de lien.
    key: (ROUTE_KEYS.has(rawKey) ? rawKey : "home") as PublicRouteKey,
    locale: ((locales as readonly string[]).includes(rawLocale)
      ? rawLocale
      : defaultLocale) as Locale,
  };
}

/**
 * Combien de vignettes une même adresse IP peut faire RENDRE par minute.
 *
 * Le rendu satori d'un PNG de 1200×630 est, de loin, le calcul le plus cher que
 * cette application offre sans authentification. La borne est haute parce que
 * les scrapers légitimes (Slack, X, un client mail) tapent en rafale sur les
 * douze adresses canoniques — mais elle existe, ce qui n'était pas le cas.
 */
const OG_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const { key, locale } = parseParams(request);
  const route = routeByKey(key);

  // La CLÉ DE CACHE, d'abord (MIN-348). Le contenu ne dépend que de deux
  // paramètres, mais le CDN, lui, indexe sur l'URL entière : `?route=home&x=1`,
  // `&x=2`, `&x=3`… sont autant d'entrées neuves, donc autant de rendus. Une
  // adresse non canonique est donc renvoyée vers la canonique — 308, sans
  // rendre l'image — et il ne reste qu'une douzaine d'URLs à rendre pour tout
  // le site. Le limiteur ci-dessous ne garde plus que ces douze-là.
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
  const title = namespace.metaTitle ?? "minddy";
  const description = namespace.metaDescription ?? "";

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
            minddy
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
          <span style={{ fontSize: 26, color: "#6b7280" }}>minddy.app</span>
        </div>
      </div>
    ),
    {
      ...SIZE,
      headers: {
        // Le contenu ne dépend que des deux paramètres d'URL : une fois rendue,
        // la vignette peut rester longtemps dans le CDN et chez les scrapers.
        "Cache-Control": "public, max-age=3600, s-maxage=86400, immutable",
      },
    },
  );
}

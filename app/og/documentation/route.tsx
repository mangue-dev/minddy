import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { MINDDY_LOGO_PATH, MINDDY_LOGO_VIEWBOX } from "@/lib/brand";
import { getLegacyDocumentationRoute, getVisibleDocumentation, isDocumentationPreview } from "@/lib/server/documentation";
import { getClientIp } from "@/lib/server/request-ip";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";

const SIZE = { width: 1200, height: 630 };
const INK = "#26332c";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const rawLocale = params.get("locale") ?? "";
  const locale = ((locales as readonly string[]).includes(rawLocale) ? rawLocale : defaultLocale) as Locale;
  const id = params.get("article") ?? "";
  const canonicalId = getLegacyDocumentationRoute(id)?.article ?? id;
  const article = getVisibleDocumentation(locale).find(item => item.id === canonicalId);
  if (!article) return new NextResponse("Not found", { status: 404 });

  const preview = isDocumentationPreview();
  const cacheControl = preview ? "private, no-store" : "public, max-age=3600, s-maxage=86400";
  // Keep the renderable URL set bounded, including legacy links and extra parameters.
  const canonical = new URLSearchParams({ article: article.id, locale }).toString();
  if (request.nextUrl.search.slice(1) !== canonical) {
    const target = new URL(request.nextUrl);
    target.search = canonical;
    return NextResponse.redirect(target, { status: 308, headers: { "Cache-Control": cacheControl } });
  }

  // Share the public site's image-rendering budget rather than adding a second pool.
  const refused = rateLimitRefusal(`ip:${getClientIp(request)}`, "og", { limit: 60, windowMs: 60_000 });
  if (refused) return refused;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column",
      justifyContent: "space-between", padding: 80, color: INK,
      background: "linear-gradient(135deg, #faf9f6 0%, #f0f3ec 100%)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <svg width={50} height={50} viewBox={MINDDY_LOGO_VIEWBOX} fill={INK}>
          <path fillRule="evenodd" clipRule="evenodd" d={MINDDY_LOGO_PATH} />
        </svg>
        <div style={{ width: 1, height: 38, background: "#bfc8bd", marginLeft: 6, marginRight: 6 }} />
        <span style={{ fontSize: 40, color: INK, letterSpacing: -1 }}>Docs</span>
      </div>
      <div style={{ display: "flex", fontSize: article.title.length > 56 ? 64 : article.title.length > 36 ? 76 : 88,
        lineHeight: 1.12, letterSpacing: -2.5, maxWidth: 1040 }}>
        {article.title}
      </div>
    </div>,
    { ...SIZE, headers: { "Cache-Control": cacheControl } },
  );
}

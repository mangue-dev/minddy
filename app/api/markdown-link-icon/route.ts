import { NextResponse, type NextRequest } from "next/server";
import { MAX_LINK_URL_LENGTH } from "@/lib/server/attachments";
import { resolveFavicon } from "@/lib/server/favicon";
import { getClientIp } from "@/lib/server/request-ip";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

const ICON_CACHE = "public, max-age=86400, stale-while-revalidate=604800";
const FALLBACK_CACHE = "public, max-age=3600, stale-while-revalidate=86400";
const GLOBE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#0085FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20"/></svg>`;

function iconResponse(body: BodyInit, contentType: string, cacheControl: string) {
  return new NextResponse(body, {
    headers: {
      "Cache-Control": cacheControl,
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function globeResponse() {
  return iconResponse(GLOBE, "image/svg+xml; charset=utf-8", FALLBACK_CACHE);
}

/** Resolve a site favicon without exposing the visitor to a third-party request. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url || url.length > MAX_LINK_URL_LENGTH) return globeResponse();

  const rate = checkSessionRateLimit(
    `ip:${getClientIp(request)}`,
    "markdown-link-icon",
    { limit: 240 },
  );
  if (!rate.allowed) return globeResponse();

  try {
    const icon = await resolveFavicon(url);
    return iconResponse(new Uint8Array(icon.bytes), icon.contentType, ICON_CACHE);
  } catch {
    return globeResponse();
  }
}

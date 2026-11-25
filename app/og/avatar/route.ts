import { NextResponse, type NextRequest } from "next/server";
import { getClientIp } from "@/lib/server/request-ip";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import { isAvatarImageSeed, renderAvatarPng } from "@/lib/server/avatar-image";

/**
 * A Lorelei portrait as a round PNG (MIN-963), for the inviter's avatar in the
 * invitation email: mail clients do not show the app's SVG `data:` portraits.
 * Public like `/og/orb`, and for the same reason: the recipient has no session.
 * The seed is an opaque UUID, never an account id (`lib/server/avatar-image.ts`).
 */

const AVATAR_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

const CACHE = "public, max-age=31536000, s-maxage=31536000, immutable";

export async function GET(request: NextRequest) {
  const seed = request.nextUrl.searchParams.get("s");
  if (!isAvatarImageSeed(seed)) {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
  }

  // One CDN entry per portrait, as `/og/orb` does (MIN-348).
  const canonical = `s=${seed}`;
  if (request.nextUrl.search.replace(/^\?/, "") !== canonical) {
    const target = new URL(request.nextUrl);
    target.search = canonical;
    return NextResponse.redirect(target, {
      status: 308,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    });
  }

  const refused = rateLimitRefusal(`ip:${getClientIp(request)}`, "og-avatar", AVATAR_RATE_LIMIT);
  if (refused) return refused;

  return new NextResponse(new Uint8Array(await renderAvatarPng(seed)), {
    headers: { "Content-Type": "image/png", "Cache-Control": CACHE },
  });
}

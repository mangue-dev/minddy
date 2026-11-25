import { NextResponse, type NextRequest } from "next/server";
import { getClientIp } from "@/lib/server/request-ip";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import {
  orbStyleParam,
  parseOrbStyleParam,
  renderOrbPng,
} from "@/lib/server/project-orb-image";

/**
 * A project orb as a PNG (MIN-963), for the invitation email: mail clients
 * cannot paint `<ProjectOrb>`'s conic gradient and blur. Public like the
 * sharing tile next door: the recipient of an invitation has no session, and
 * the URL carries the seven drawn traits, never a project id
 * (`lib/server/project-orb-image.ts`).
 *
 * The email points at `SITE_URL`, so this route serves every deployment's
 * emails from production. Until it is released there, the email's colored
 * cell under the image still shows the orb's color.
 */

/** Generous: an image proxy fetches once per message, and the CDN keeps the rest. */
const ORB_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

const CACHE = "public, max-age=31536000, s-maxage=31536000, immutable";

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function GET(request: NextRequest) {
  const style = parseOrbStyleParam(request.nextUrl.searchParams.get("o"));
  if (!style) {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
  }

  // One CDN entry per orb: any other spelling of the same traits (extra
  // parameters, unclamped or unrounded numbers) is sent to the canonical URL
  // before anything is painted, as `app/og/route.tsx` does (MIN-348).
  // Compared decoded: an image proxy that writes the commas as `%2C` asks for
  // the same orb, and redirecting it would loop.
  const canonical = `o=${orbStyleParam(style)}`;
  if (safeDecode(request.nextUrl.search.replace(/^\?/, "")) !== canonical) {
    const target = new URL(request.nextUrl);
    target.search = canonical;
    return NextResponse.redirect(target, {
      status: 308,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    });
  }

  const refused = rateLimitRefusal(`ip:${getClientIp(request)}`, "og-orb", ORB_RATE_LIMIT);
  if (refused) return refused;

  return new NextResponse(new Uint8Array(renderOrbPng(style)), {
    headers: { "Content-Type": "image/png", "Cache-Control": CACHE },
  });
}

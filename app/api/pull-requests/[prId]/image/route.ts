import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  prCommentImageResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * GET /api/pull-requests/[prId]/image?asset=<uuid> — an image pasted into an
 * PR commentary (MIN-162).
 *
 * Without this detour, the image is not displayed: the URL carried by the markdown body
 * requires a GitHub session which minddy does not have. The why and the measure are
 * in `lib/forge-image-assets` ; the guards (constrained identifier, target
 * resolved by forge, host checked, MIME type deduced from path) in
 * `prCommentImageResponse`.
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const asset = request.nextUrl.searchParams.get("asset");
  if (!asset) return NextResponse.json({ error: "asset required" }, { status: 400 });

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prCommentImageResponse(auth.scope, asset);
}

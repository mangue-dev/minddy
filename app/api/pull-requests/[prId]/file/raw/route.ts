import { NextResponse, type NextRequest } from "next/server";

import { authorizePrRequest, prFileBytesResponse } from "@/lib/server/agent/pr-actions";

/**
 * Bytes of a pull request diff file (MIN-66) — what the diff view
 * puts in its `<img>` tags to show a modified image side by side, at
 * instead of giving up on “diff unavailable”.
 * GET ?path=…&side=base|head → the file, under the MIME type of its extension.
 *
 * Proxy and not direct link: the repository is often private, and a `<img src>` does not
 * cannot carry the installation token. See `prFileBytesResponse` for
 * guards (path in CE diff, known image extension, capped size).
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const path = request.nextUrl.searchParams.get("path");
  const side = request.nextUrl.searchParams.get("side");
  if (!path) return NextResponse.json({ error: "Path required" }, { status: 400 });
  if (side !== "base" && side !== "head") {
    return NextResponse.json({ error: "Side must be base or head" }, { status: 400 });
  }

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prFileBytesResponse(auth.scope, path, side);
}

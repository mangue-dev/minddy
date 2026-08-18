import { NextResponse, type NextRequest } from "next/server";

import { authorizePrRequest, prFileSourceResponse } from "@/lib/server/agent/pr-actions";

/**
 * BASE version of a pull request diff file (MIN-143) — source
 * which the view diff needs to unfold the hidden context around the hunks.
 *  GET ?path=… → { content } (raw file text at the merge base).
 *
 * Called on demand, at the first unfolding of a file: open a diff
 * triggers none. The requested path is validated against CE diff files
 * — otherwise the route would read any file in the repository.
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const path = request.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Path required" }, { status: 400 });

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prFileSourceResponse(auth.scope, path);
}

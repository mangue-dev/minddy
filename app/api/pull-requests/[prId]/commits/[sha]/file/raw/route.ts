import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  isCommitSha,
  prCommitFileBytesResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * Bytes of a commit diff file — what the diff view puts in its
 * `<img>` to show a side-by-side image (MIN-66), at both CE refs
 * commit: its parent on one side, itself on the other.
 * GET ?path=…&side=base|head → the file, under the MIME type of its extension.
 */

type RouteContext = { params: Promise<{ prId: string; sha: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId, sha } = await params;
  if (!isCommitSha(sha)) {
    return NextResponse.json({ error: "Invalid commit sha" }, { status: 400 });
  }
  const path = request.nextUrl.searchParams.get("path");
  const side = request.nextUrl.searchParams.get("side");
  if (!path) return NextResponse.json({ error: "Path required" }, { status: 400 });
  if (side !== "base" && side !== "head") {
    return NextResponse.json({ error: "Side must be base or head" }, { status: 400 });
  }

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prCommitFileBytesResponse(auth.scope, sha, path, side);
}

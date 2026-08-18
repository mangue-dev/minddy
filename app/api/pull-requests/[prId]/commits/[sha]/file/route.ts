import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  isCommitSha,
  prCommitFileSourceResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * BEFORE-commit version of a file its diff — context unfolding
 * the diff view of a commit.
 *  GET ?path=… → { content } (raw file text at the commit PARENT).
 *
 * Twin of `[prId]/file`, except for one ref, and that's the whole point of the route:
 * unfolding the diff of a commit with the merge base of the PR would show the lines
 * before all other commits.
 */

type RouteContext = { params: Promise<{ prId: string; sha: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId, sha } = await params;
  if (!isCommitSha(sha)) {
    return NextResponse.json({ error: "Invalid commit sha" }, { status: 400 });
  }
  const path = request.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Path required" }, { status: 400 });

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prCommitFileSourceResponse(auth.scope, sha, path);
}

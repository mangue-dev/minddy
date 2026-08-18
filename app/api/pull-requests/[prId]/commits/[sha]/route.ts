import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  isCommitSha,
  prCommitDiffResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * The diff of ONE commit of the pull request — what THIS commit changes, versus its
 * parent.
 *  GET → { files, additions, deletions, url, parentSha, message, author… }
 *
 * The SHA is validated twice: its FORM here (it ends in a forge URL),
 * its BELONGING to this PR on the `prCommitDiffResponse` side — otherwise the road
 * would serve the diff of any commit in the repository.
 */

type RouteContext = { params: Promise<{ prId: string; sha: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId, sha } = await params;
  if (!isCommitSha(sha)) {
    return NextResponse.json({ error: "Invalid commit sha" }, { status: 400 });
  }

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prCommitDiffResponse(auth.scope, sha);
}

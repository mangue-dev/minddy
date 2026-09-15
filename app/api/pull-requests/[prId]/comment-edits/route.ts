import { NextResponse, type NextRequest } from "next/server";

import { authorizePrRequest } from "@/lib/server/agent/pr-actions";
import { listPrCommentEdits } from "@/lib/server/agent/pr-comment-edits";

/**
 * Previous versions of one thread comment (MIN-548), OLDEST-first: the body
 * each edit replaced, who edited it, and when. The snapshots live in
 * `pr_comment_edits`, fed by the edit API and by the GitHub webhook.
 * `?commentId=N` is required: without it the route has no subject.
 */

type RouteContext = { params: Promise<{ prId: string }> };

export async function GET(
  request: NextRequest,
  { params }: RouteContext,
) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;

  const raw = new URL(request.url).searchParams.get("commentId");
  const commentId = raw == null ? Number.NaN : Number(raw);
  if (!Number.isSafeInteger(commentId) || commentId < 1) {
    return NextResponse.json({ error: "commentId required" }, { status: 400 });
  }

  const edits = await listPrCommentEdits({
    provider: auth.scope.target.provider,
    repoFullName: auth.scope.target.repoFullName,
    prNumber: auth.scope.pr.number,
    commentId,
  });
  return NextResponse.json({ edits });
}

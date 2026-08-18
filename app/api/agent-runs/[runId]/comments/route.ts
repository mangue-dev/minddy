import { NextResponse, type NextRequest } from "next/server";

import {
  authorizeRunPrRequest,
  createPrCommentResponse,
  prCommentsResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * FACING (MIN-143) of the conversation thread of a PR: the route by PR is
 * `/api/pull-requests/[prId]/comments`. This resolves the run → its PR and
 * delegates — kept for deep-links `?run=` and page `/agents`.
 *
 * GET → comments from the PR (`{ comments: [] }` if the run does not have one).
 *  POST → { body } adds a comment.
 */

type RouteContext = { params: Promise<{ runId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await authorizeRunPrRequest(request, runId);
  if (!auth.ok) {
    if ("noPr" in auth) return NextResponse.json({ comments: [] });
    return auth.response;
  }
  return prCommentsResponse(auth.scope);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;

  let payload: { body?: string };
  try {
    payload = (await request.json()) as { body?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // `?.`: a JSON body `null` is valid on the parser side but has no fields.
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!body) return NextResponse.json({ error: "Comment required" }, { status: 400 });

  const auth = await authorizeRunPrRequest(request, runId);
  if (!auth.ok) return auth.response;
  return createPrCommentResponse(auth.scope, body, auth.userId);
}

import { NextResponse, type NextRequest } from "next/server";

import {
  authorizeRunPrRequest,
  createPrReviewCommentResponse,
  parseReviewCommentPayload,
  parseReviewThreadPayload,
  prReviewCommentsResponse,
  setPrReviewThreadResolvedResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * FACING (MIN-143) of review comments — those anchored to a line in the diff.
 * The route by PR is `/api/pull-requests/[prId]/review-comments` ; this one
 * resolves the run → its PR and delegates, for the deep-links `?run=` and `/agents`.
 *
 * GET → { comments, threads } (empty lists if the run has no PR).
 *  POST  → { body, path, line, side } | { body, in_reply_to }
 *  PATCH → { thread_id, resolved }
 */

type RouteContext = { params: Promise<{ runId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await authorizeRunPrRequest(request, runId);
  if (!auth.ok) {
    if ("noPr" in auth) return NextResponse.json({ comments: [], threads: [] });
    return auth.response;
  }
  return prReviewCommentsResponse(auth.scope);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseReviewCommentPayload(raw);
  if (!parsed.ok) return parsed.response;

  const auth = await authorizeRunPrRequest(request, runId);
  if (!auth.ok) return auth.response;
  return createPrReviewCommentResponse(auth.scope, parsed.payload, auth.userId);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseReviewThreadPayload(raw);
  if (!parsed.ok) return parsed.response;

  const auth = await authorizeRunPrRequest(request, runId);
  if (!auth.ok) return auth.response;
  return setPrReviewThreadResolvedResponse(auth.scope, parsed.payload);
}

import { NextResponse, type NextRequest } from "next/server";

import {
  authorizeRunPrRequest,
  createPrReviewCommentResponse,
  parseReviewCommentPayload,
  prReviewCommentsResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * FAÇADE (MIN-143) des commentaires de review — ceux ancrés à une ligne du diff.
 * La route par PR est `/api/pull-requests/[prId]/review-comments` ; celle-ci
 * résout le run → sa PR et délègue, pour les deep-links `?run=` et `/agents`.
 *
 *  GET  → commentaires de review (`{ comments: [] }` si le run n'a pas de PR).
 *  POST → { body, path, line, side } | { body, in_reply_to }
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
  return createPrReviewCommentResponse(auth.scope, parsed.payload);
}

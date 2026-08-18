import { NextResponse, type NextRequest } from "next/server";

import {
  authorizeRunPrRequest,
  parseReactionPayload,
  setPrReviewCommentReactionResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * Frontage by RUN of review reactions (MIN-139) — like its neighbors, it
 * resolves the run → its PR and delegates, for the deep-links `?run=` and `/agents`.
 *
 *  POST → { comment_id, content, on }
 */

type RouteContext = { params: Promise<{ runId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseReactionPayload(raw);
  if (!parsed.ok) return parsed.response;

  const auth = await authorizeRunPrRequest(request, runId);
  if (!auth.ok) return auth.response;
  return setPrReviewCommentReactionResponse(auth.scope, parsed.payload);
}

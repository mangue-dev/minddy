import { NextResponse, type NextRequest } from "next/server";

import {
  authorizeRunPrRequest,
  parseReactionPayload,
  setPrReviewCommentReactionResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * Façade par RUN des réactions de review (MIN-139) — comme ses voisines, elle
 * résout le run → sa PR et délègue, pour les deep-links `?run=` et `/agents`.
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

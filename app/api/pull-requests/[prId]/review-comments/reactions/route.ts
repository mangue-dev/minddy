import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  parseReactionPayload,
  setPrReviewCommentReactionResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * Emoji reactions from a review comment (MIN-139).
 *
 * Road apart, and not one more verb on `../review-comments`: the target is not
 * not the same — a COMMENT, not the thread or the list. The reactions can be READ,
 * them, with the comments (the neighboring GET serves them in `reactions`): a thread
 * renders in one block, and two requests to display it would get out of sync.
 *
 * POST → { comment_id, content, on } post (`on: true`) or remove the reaction
 */

type RouteContext = { params: Promise<{ prId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseReactionPayload(raw);
  if (!parsed.ok) return parsed.response;

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return setPrReviewCommentReactionResponse(auth.scope, parsed.payload);
}

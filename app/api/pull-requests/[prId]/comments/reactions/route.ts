import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  parseReactionPayload,
  setPrCommentReactionResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * Conversation THREAD emoji reactions (MIN-147) — the exact counterpart of
 * `../../review-comments/reactions`, on the other surface: on GitHub, react
 * walks everywhere, and minddy only let him do it on anchored comments
 * to a line of code.
 *
 * `comment_id: 0` targets the BODY of the pull request (`PR_BODY_COMMENT_ID`), the
 * message that opens the thread — hence `allowBody`, that the review route does not open.
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
  const parsed = parseReactionPayload(raw, { allowBody: true });
  if (!parsed.ok) return parsed.response;

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return setPrCommentReactionResponse(auth.scope, parsed.payload);
}

import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  createPrCommentResponse,
  prCommentsResponse,
  updatePrCommentResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * Pull request thread (MIN-143), served by the forge API
 * through a fresh token.
 * GET → PR comments.
 * POST → { body } add a comment (author = the GitHub App minddy, or the
 * GitLab account connected); { commentId, body } edit an existing comment
 * under the connected account, snapshotting its previous body first (MIN-548).
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prCommentsResponse(auth.scope);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;

  let payload: { body?: string; commentId?: number };
  try {
    payload = (await request.json()) as { body?: string; commentId?: number };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // `?.`: a JSON body `null` is valid on the parser side but has no fields.
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!body) return NextResponse.json({ error: "Comment required" }, { status: 400 });

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;

  if (payload?.commentId != null) {
    if (
      typeof payload.commentId !== "number" ||
      !Number.isSafeInteger(payload.commentId) ||
      payload.commentId < 1
    ) {
      return NextResponse.json({ error: "Invalid commentId" }, { status: 400 });
    }
    return updatePrCommentResponse(auth.scope, {
      commentId: payload.commentId,
      body,
    });
  }

  return createPrCommentResponse(auth.scope, body, auth.userId, auth.supabase);
}

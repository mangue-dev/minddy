import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  createPrReviewCommentResponse,
  parseReviewCommentPayload,
  parseReviewThreadPayload,
  prReviewCommentsResponse,
  setPrReviewThreadResolvedResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * Pull request review comments (MIN-143) — those anchored to a line
 * of the diff, as opposed to the flat wire of `/comments`. These are REAL
 * comments from the forge: they appear on the PR, and Numo rereads them.
 * GET → { comments, threads } — comments and the status of their threads.
 * POST → { body, path, line, side } post on a line
 * | { body, in_reply_to } replies in a thread
 * PATCH → { thread_id, resolved } resolves/reopens a thread (MIN-139)
 *
 * A comment leaves IMMEDIATELY (equivalent to “Add single comment”): no
 * group review, no draft.
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prReviewCommentsResponse(auth.scope);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseReviewCommentPayload(raw);
  if (!parsed.ok) return parsed.response;

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return createPrReviewCommentResponse(auth.scope, parsed.payload, auth.userId);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseReviewThreadPayload(raw);
  if (!parsed.ok) return parsed.response;

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return setPrReviewThreadResolvedResponse(auth.scope, parsed.payload);
}

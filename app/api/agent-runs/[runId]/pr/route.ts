import { NextResponse, type NextRequest } from "next/server";

import {
  authorizeRunPrRequest,
  prDetailResponse,
  prReviewResponse,
  prStateActionResponse,
  type PrActionBody,
} from "@/lib/server/agent/pr-actions";

/**
 * FACADE (MIN-143): the review of a PR is indexed by the PR
 * (`/api/pull-requests/[prId]`) since a human PR — which has no runs —
 * must also be rereadable. This route resolves the run → its PR and
 * delegate.
 *
 * It remains because the `?run=` deep-links already in circulation depend on it,
 * and because the agent conversation (`/agents`) speaks in `runId`: break it
 * would break this page.
 *
 * GET → metadata PR + files + checks + approvals + merge methods,
 * or `{ pr: null, files: [] }` if the run does not (yet) have a PR.
 * POST → merge | close | reopen | ready_for_review | convert_to_draft | review.
 */

type RouteContext = { params: Promise<{ runId: string }> };

// `review` + relaunch launches a cold run and kicks the drain in after(): it
// it needs the full drain window (270 s budget).
export const maxDuration = 300;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await authorizeRunPrRequest(request, runId);
  if (!auth.ok) {
    // Run without PR: empty response, not an error — the PR view of a session that
    // that has not opened one yet must still be displayable.
    if ("noPr" in auth) return NextResponse.json({ pr: null, files: [] });
    return auth.response;
  }
  return prDetailResponse(auth.scope);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;

  let body: PrActionBody;
  try {
    const parsed: unknown = await request.json();
    // Non-object body (null, string…): refused here rather than crashing further down.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as PrActionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action;
  if (
    action !== "merge" &&
    action !== "close" &&
    action !== "reopen" &&
    action !== "review" &&
    action !== "ready_for_review" &&
    action !== "convert_to_draft"
  ) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const auth = await authorizeRunPrRequest(request, runId);
  if (!auth.ok) return auth.response;

  if (action === "review") {
    return prReviewResponse(auth.scope, body, auth.userId);
  }
  return prStateActionResponse(auth.scope, action, body, auth.userId);
}

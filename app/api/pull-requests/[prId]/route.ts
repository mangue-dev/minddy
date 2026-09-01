import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  prAiReviewResponse,
  prDetailResponse,
  prLinkIssueResponse,
  prMaintenanceActionResponse,
  prReviewResponse,
  prStateActionResponse,
  type PrActionBody,
} from "@/lib/server/agent/pr-actions";

/**
 * In-app review of a pull request, indexed BY THE PR (MIN-143).
 * GET → metadata PR + files/patches + CI checks + approvals + methods
 * of merge offered by the forge.
 *  POST → { action: 'merge', method? }
 *       | { action: 'close' }
 * | { action: 'reopen' } → closed → reopened (MIN-164)
 * | { action: 'ready_for_review' } → draft → ready
 *       | { action: 'review', verdict, message, relaunch?, model?, reasoningLevel?, localExec?, localWorktree? }
 *       | { action: 'ai_review', model?, reasoningLevel? }    → Numo relit (MIN-141)
 *       | { action: 'link_issue', issueId }                  → attaches a ticket (MIN-163)
 *
 * `ai_review` returns a 202 with the agent SESSION anchored to this PR (MIN-168):
 * the agent clones the branch, reads the code and comments, and the session watches itself
 * in `/agents` — `./ai-review` gives the status for the PR thread.
 *
 * The old `agent-runs/[runId]/pr/*` roads have become facades of
 * these: the body of each gesture lives in `lib/server/agent/pr-actions`,
 * routes only do auth.
 */

type RouteContext = { params: Promise<{ prId: string }> };

// `review` + relaunch launches a cold run and kicks the drain in after(): it
// it needs the full drain window (270 s budget), otherwise the first
// chunk is killed in the middle of a round — same reason as /api/issues/[id]/agent.
export const maxDuration = 300;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prDetailResponse(auth.scope);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;

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
    action !== "ai_review" &&
    action !== "ready_for_review" &&
    action !== "link_issue" &&
    action !== "update_branch" &&
    action !== "rerun_check" &&
    action !== "update_title" &&
    action !== "enable_auto_merge"
  ) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;

  if (action === "review") {
    return prReviewResponse(auth.scope, body, auth.userId);
  }
  if (action === "link_issue") {
    return prLinkIssueResponse(auth.scope, auth.supabase, body, auth.userId);
  }
  if (action === "ai_review") {
    // Language is no longer a parameter: an agent session writes in that of
    // its launcher, resolved in the first chunk as for all the others.
    return prAiReviewResponse(auth.scope, auth.userId, body.model, body.reasoningLevel);
  }
  if (
    action === "update_branch" ||
    action === "rerun_check" ||
    action === "update_title" ||
    action === "enable_auto_merge"
  ) {
    return prMaintenanceActionResponse(auth.scope, action, body);
  }
  return prStateActionResponse(auth.scope, action, body, auth.userId);
}

import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  prAiMergeResponse,
  prDetailResponse,
  prLinkIssueResponse,
  prUnlinkIssueResponse,
  prMaintenanceActionResponse,
  prReviewResponse,
  prStateActionResponse,
  type PrActionBody,
} from "@/lib/server/agent/pr-actions";

/**
 * In-app review of a pull request, indexed BY THE PR (MIN-143).
 * GET → metadata PR + files/patches + CI checks + approvals + methods
 * of merge offered by the forge.
 *  POST → { action: 'merge', method?, commitTitle?, commitMessage? }
 *       | { action: 'close' }
 * | { action: 'reopen' } → closed → reopened (MIN-164)
 * | { action: 'ready_for_review' } → draft → ready
 * | { action: 'convert_to_draft' } → open → draft
 *       | { action: 'review', verdict, message? }
 *       | { action: 'merge_with_numo' } → merge with a generated message
 *       | { action: 'link_issue', issueId } → adds an issue association
 *       | { action: 'unlink_issue', issueId } → removes an issue association
 *
 * The body of each gesture lives in `lib/server/agent/pr-actions`; routes only
 * do auth.
 */

type RouteContext = { params: Promise<{ prId: string }> };

// Merge message generation may continue after the response.
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
    action !== "ready_for_review" &&
    action !== "convert_to_draft" &&
    action !== "link_issue" &&
    action !== "unlink_issue" &&
    action !== "update_branch" &&
    action !== "rerun_check" &&
    action !== "update_title" &&
    action !== "update_body" &&
    action !== "enable_auto_merge" &&
    action !== "disable_auto_merge" &&
    action !== "merge_with_numo"
  ) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;

  if (action === "merge_with_numo") {
    return prAiMergeResponse(auth.scope, body, auth.userId);
  }
  if (action === "review") {
    return prReviewResponse(auth.scope, body, auth.userId);
  }
  if (action === "unlink_issue") {
    return prUnlinkIssueResponse(auth.scope, auth.supabase, body);
  }
  if (action === "link_issue") {
    return prLinkIssueResponse(auth.scope, auth.supabase, body, auth.userId);
  }
  if (
    action === "update_branch" ||
    action === "rerun_check" ||
    action === "update_title" ||
    action === "update_body" ||
    action === "enable_auto_merge" ||
    action === "disable_auto_merge"
  ) {
    return prMaintenanceActionResponse(auth.scope, action, body);
  }
  return prStateActionResponse(auth.scope, action, body, auth.userId);
}

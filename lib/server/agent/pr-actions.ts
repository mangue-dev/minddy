import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { isPrAction, type PrAction } from "@/lib/pull-request-contract";
import { authorizePrRequest, type PrRequestAuth } from "./pr-access";
import { prLinkIssueResponse, prUnlinkIssueResponse } from "./pr-linking";
import { prMaintenanceActionResponse } from "./pr-maintenance";
import { prReviewResponse } from "./pr-reviews";
import { prAiMergeResponse, prStateActionResponse } from "./pr-state-actions";

/**
 * POST /api/pull-requests/[prId]: the review gestures of a pull request
 * (MIN-143). Each gesture has one implementation in its domain module; this
 * module parses the body, authorizes and dispatches.
 *
 * `syncIssueStatusFromPr` and activity tracking read the current
 * `pull_request_issues` associations. A PR can carry several tickets; a PR
 * without a ticket synchronizes and records nothing, which is a normal case.
 */

export interface PrActionBody {
  action?: string;
  message?: string;
  verdict?: string;
  method?: string;
  commitTitle?: string;
  commitMessage?: string;
  title?: string;
  body?: string;
  rerunRef?: { kind?: string; id?: number };
  /** `link_issue`: the ticket to attach to this PR (MIN-163). */
  issueId?: string;
}

// ── POST /api/pull-requests/[prId] ──────────────────────────────────────────

type AuthorizedPrRequest = Extract<PrRequestAuth, { ok: true }>;

/**
 * The handler of every action of the PR route. Each one changes the pull
 * request, so each needs write access (a Reader is refused every action,
 * MIN-693, even a review the forge would accept from a read-only account).
 * The client action types come from the same names (`lib/pull-request-contract`).
 */
const PR_ACTION_TABLE = {
  merge: (a, body) => prStateActionResponse(a.scope, "merge", body, a.userId),
  close: (a, body) => prStateActionResponse(a.scope, "close", body, a.userId),
  reopen: (a, body) => prStateActionResponse(a.scope, "reopen", body, a.userId),
  ready_for_review: (a, body) => prStateActionResponse(a.scope, "ready_for_review", body, a.userId),
  convert_to_draft: (a, body) => prStateActionResponse(a.scope, "convert_to_draft", body, a.userId),
  update_branch: (a, body) => prMaintenanceActionResponse(a.scope, "update_branch", body),
  rerun_check: (a, body) => prMaintenanceActionResponse(a.scope, "rerun_check", body),
  update_title: (a, body) => prMaintenanceActionResponse(a.scope, "update_title", body),
  update_body: (a, body) => prMaintenanceActionResponse(a.scope, "update_body", body),
  enable_auto_merge: (a, body) => prMaintenanceActionResponse(a.scope, "enable_auto_merge", body),
  disable_auto_merge: (a, body) => prMaintenanceActionResponse(a.scope, "disable_auto_merge", body),
  review: (a, body) => prReviewResponse(a.scope, body, a.userId),
  merge_with_numo: (a, body) => prAiMergeResponse(a.scope, body, a.userId),
  link_issue: (a, body) => prLinkIssueResponse(a.scope, a.supabase, body, a.userId),
  unlink_issue: (a, body) => prUnlinkIssueResponse(a.scope, a.supabase, body),
} satisfies Record<PrAction, (auth: AuthorizedPrRequest, body: PrActionBody) => Promise<Response>>;

/** Parses the body, refuses an unknown action before any lookup, then authorizes and dispatches. */
export async function prActionResponse(request: NextRequest, prId: string): Promise<Response> {
  let body: PrActionBody;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as PrActionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isPrAction(body.action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const auth = await authorizePrRequest(request, prId, "write");
  if (!auth.ok) return auth.response;
  return PR_ACTION_TABLE[body.action](auth, body);
}

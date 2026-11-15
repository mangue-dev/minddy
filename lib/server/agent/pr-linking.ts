import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { issueStore } from "@/lib/server/issue-store";
import { getServiceClient } from "@/lib/supabase-service";
import type { PrActionBody } from "./pr-actions";
import { linkPullRequestToIssue, type PrLinkRefusal } from "./pr-link";
import { broadcastPrChanged } from "./pr-live";
import type { PrScope } from "./pr-scope";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A translated linking refusal, with its `code` for the caller. */
async function linkRefusal(
  code: "prAlreadyLinked" | "issueAlreadyLinked" | "issueOutsideRepo",
  status: number,
): Promise<NextResponse> {
  const t = await getTranslations("ApiErrors");
  return NextResponse.json({ error: t(code), code }, { status });
}

/** Refusal of the shared linking rule → the message key shown on screen. */
const LINK_REFUSAL_KEYS = {
  pr_already_linked: "prAlreadyLinked",
  issue_already_linked: "issueAlreadyLinked",
  issue_outside_repo: "issueOutsideRepo",
} as const satisfies Record<PrLinkRefusal, string>;

/** Authorize the issue through RLS, then append it using the shared linking rules. */
export async function prLinkIssueResponse(
  scope: PrScope,
  supabase: SupabaseClient,
  body: PrActionBody,
  userId: string,
): Promise<NextResponse> {
  const issueId = typeof body.issueId === "string" ? body.issueId.trim() : "";
  if (!UUID_RE.test(issueId)) {
    return NextResponse.json({ error: "Invalid issue id" }, { status: 400 });
  }
  // Use the authenticated client. RLS returns nothing for a ticket the user
  // cannot see, which becomes a 404 without revealing that it exists elsewhere.
  const { data } = await issueStore(supabase).select("id, number, title, project_id, deleted_at")
    .eq("id", issueId)
    .maybeSingle();
  const issue = data as {
    id: string;
    number: number;
    title: string;
    project_id: string;
    deleted_at: string | null;
  } | null;
  if (!issue || issue.deleted_at) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  const result = await linkPullRequestToIssue({
    pr: scope.pr,
    issue: { id: issue.id, projectId: issue.project_id },
    actorId: userId,
  });
  if (!result.ok) {
    // `issue_outside_repo` is a malformed request (400); the other refusals are
    // state conflicts (409).
    return result.code === "issue_outside_repo"
      ? linkRefusal("issueOutsideRepo", 400)
      : linkRefusal(LINK_REFUSAL_KEYS[result.code], 409);
  }
  return NextResponse.json({
    ok: true,
    issue: { id: issue.id, number: issue.number, title: issue.title },
    status: result.status,
  });
}

/** Remove only the requested association; issue status and forge data stay unchanged. */
export async function prUnlinkIssueResponse(
  scope: PrScope,
  supabase: SupabaseClient,
  body: PrActionBody,
): Promise<NextResponse> {
  const issueId = typeof body.issueId === "string" ? body.issueId.trim() : "";
  if (!UUID_RE.test(issueId)) {
    return NextResponse.json({ error: "Invalid issue id" }, { status: 400 });
  }
  const { data: issue, error } = await issueStore(supabase).select("id")
    .eq("id", issueId).is("deleted_at", null).maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to read issue" }, { status: 500 });
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  const { data, error: unlinkError } = await getServiceClient()
    .rpc("unlink_pull_request_from_issue_atomic", { p_pr_id: scope.pr.id, p_issue_id: issueId });
  if (unlinkError) return NextResponse.json({ error: "Unable to unlink issue" }, { status: 500 });
  if (data === "pr_not_found") {
    return NextResponse.json({ error: "Pull request not found" }, { status: 404 });
  }
  if (data !== "unlinked" && data !== "already") {
    return NextResponse.json({ error: "Unable to unlink issue" }, { status: 500 });
  }
  broadcastPrChanged(scope.pr.id, ["pr"]);
  return NextResponse.json({ ok: true });
}

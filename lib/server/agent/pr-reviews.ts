import "server-only";

import { NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { REVIEW_VERDICTS, type ReviewVerdict } from "@/lib/pull-request-contract";
import { forgeErrorResponse, MAX_COMMENT_BODY_LENGTH, prOperationErrorResponse, requireActor } from "./pr-access";
import type { PrActionBody } from "./pr-actions";
import { eventForVerdict, recordPrActionEvent } from "./pr-action-events";
import { broadcastPrChanged } from "./pr-live";
import { withPrOperation } from "./pr-operation-lock";
import { actorCall, lockTarget, type PrScope } from "./pr-scope";
import { invalidateReviewQueue } from "./pull-request-review-queue";
import { pullRequestIssueIds } from "./pull-requests";

/** Request a repository member's review under the connected user's identity. */
export async function prRequestReviewerResponse(scope: PrScope, login: unknown): Promise<NextResponse> {
  if (typeof login !== "string" || !login.trim() || login.length > 255 || /[\s/]/.test(login)) {
    return NextResponse.json({ error: "Invalid reviewer" }, { status: 400 });
  }
  const actor = await requireActor(scope, "write");
  if (!actor.ok) return actor.response;
  try {
    return await withPrOperation(lockTarget(scope), "request-reviewer", async () => {
      const pr = await scope.forge.getPullRequest(scope.call);
      if (pr.state !== "open" || pr.merged) {
        return NextResponse.json({ error: "Pull request is closed" }, { status: 409 });
      }
      if (pr.user?.login.toLowerCase() === login.toLowerCase()) {
        return NextResponse.json({ error: "The author cannot review their own pull request" }, { status: 422 });
      }
      await scope.forge.requestPullRequestReviewer({ ...actorCall(actor.actor, scope), login });
      invalidateReviewQueue(scope.pr.provider, scope.call.repoFullName);
      broadcastPrChanged(scope.pr.id, ["pr", "conversation"]);
      return NextResponse.json({ ok: true });
    });
  } catch (err) {
    return prOperationErrorResponse(err);
  }
}

export async function prReviewResponse(
  scope: PrScope,
  body: PrActionBody,
  userId: string,
): Promise<Response> {
  const verdict = body.verdict as ReviewVerdict | undefined;
  if (!verdict || !REVIEW_VERDICTS.includes(verdict)) {
    return NextResponse.json({ error: "Invalid verdict" }, { status: 400 });
  }
  const message =
    typeof body.message === "string"
      ? body.message.trim().slice(0, MAX_COMMENT_BODY_LENGTH)
      : "";
  // An empty comment has nothing to say, and both providers reject it; a bare
  // approval works without a message.
  if (!message && verdict !== "approve") {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const resolved = await requireActor(scope, "read");
  if (!resolved.ok) return resolved.response;
  const actor = resolved.actor;

  let published: "review" | "comment";
  try {
    const result = await scope.forge.submitReview({
      ...actorCall(actor, scope),
      verdict,
      body: message,
      locale: await getLocale(),
    });
    published = result.published;
    invalidateReviewQueue(scope.pr.provider, scope.call.repoFullName);
  } catch (err) {
    return forgeErrorResponse(err);
  }

  // A review moves three surfaces: its message goes in the thread, its
  // remarks in the diff, and its verdict changes the approval count of the
  // header. Sent even when the forge folded the verdict into a comment.
  broadcastPrChanged(scope.pr.id, ["conversation", "reviewComments", "pr"]);

  // minddy records the actual verdict even when the forge folded it into a
  // comment: this is where the user reads "approved the PR".
  for (const issueId of await pullRequestIssueIds(scope.pr.id)) {
    await recordPrActionEvent(
      issueId,
      userId,
      eventForVerdict(verdict),
      scope.pr.number,
      scope.target.provider,
    );
  }
  return NextResponse.json({ ok: true, published });
}

import "server-only";

import { NextResponse } from "next/server";
import { unavailableMergePolicy } from "@/lib/pr-readiness";
import { PR_BODY_COMMENT_ID } from "@/lib/pr-review-reactions";
import type { PrMaintenanceAction } from "@/lib/pull-request-contract";
import { MAX_COMMENT_BODY_LENGTH, prOperationErrorResponse, requireActor } from "./pr-access";
import type { PrActionBody } from "./pr-actions";
import { recordPrCommentEditQuiet } from "./pr-comment-edits";
import { broadcastPrChanged } from "./pr-live";
import { withPrOperation } from "./pr-operation-lock";
import { actorCall, lockTarget, type PrScope } from "./pr-scope";
import { encodePullRequestContent, shouldEncryptPullRequestContent } from "./pull-request-content";
import { getServiceClient } from "@/lib/supabase-service";

export async function prMaintenanceActionResponse(
  scope: PrScope,
  action: PrMaintenanceAction,
  body: PrActionBody,
): Promise<NextResponse> {
  const actor = await requireActor(scope, "write");
  if (!actor.ok) return actor.response;
  const call = actorCall(actor.actor, scope);
  try {
    if (action === "update_branch") {
      const pr = await scope.forge.getPullRequest(scope.call);
      await withPrOperation(lockTarget(scope), "update-branch", () =>
        scope.forge.updatePullRequestBranch({ ...call, headSha: pr.headSha }),
      );
      broadcastPrChanged(scope.pr.id, ["pr", "commits", "reviewComments"]);
      return NextResponse.json({ ok: true });
    }
    if (action === "rerun_check") {
      const raw = body.rerunRef;
      if (
        !raw ||
        !Number.isInteger(raw.id) ||
        (raw.kind !== "github_check_suite" && raw.kind !== "gitlab_pipeline")
      ) {
        return NextResponse.json(
          { error: "Invalid check rerun reference", code: "invalidRerunRef" },
          { status: 400 },
        );
      }
      const ref: { kind: "github_check_suite" | "gitlab_pipeline"; id: number } = {
        kind: raw.kind,
        id: raw.id as number,
      };
      await withPrOperation(lockTarget(scope), `rerun:${ref.kind}:${ref.id}`, () =>
        scope.forge.rerunPullRequestCheck({ ...call, ref }),
      );
      broadcastPrChanged(scope.pr.id, ["pr"]);
      return NextResponse.json({ ok: true });
    }
    if (action === "enable_auto_merge") {
      const pr = await scope.forge.getPullRequest(scope.call);
      const policy = pr.base
        ? await scope.forge.getRepositoryMergePolicy({ ...scope.call, base: pr.base })
        : unavailableMergePolicy(scope.target.provider, "unknown");
      if (!policy.available || (!policy.mergeQueueRequired && !policy.autoMergeAllowed)) {
        return NextResponse.json(
          { error: "Merge flow is unavailable", code: "mergeFlowUnavailable" },
          { status: 409 },
        );
      }
      await withPrOperation(lockTarget(scope), "merge-flow", () =>
        scope.forge.enablePullRequestMergeFlow({
          ...call,
          nodeId: pr.nodeId,
          headSha: pr.headSha,
          method: policy.preferredMethod ?? undefined,
          queue: policy.mergeQueueRequired === true,
        }),
      );
      broadcastPrChanged(scope.pr.id, ["pr"]);
      return NextResponse.json({ ok: true });
    }
    if (action === "disable_auto_merge") {
      const pr = await scope.forge.getPullRequest(scope.call);
      if (!pr.mergeFlowActive) {
        // Nothing registered at the forge: a no-op, not an error — the
        // checkbox may lag one poll behind the reality of the forge.
        return NextResponse.json({ ok: true });
      }
      const policy = pr.base
        ? await scope.forge.getRepositoryMergePolicy({ ...scope.call, base: pr.base })
        : unavailableMergePolicy(scope.target.provider, "unknown");
      await withPrOperation(lockTarget(scope), "merge-flow", () =>
        scope.forge.disablePullRequestMergeFlow({
          ...call,
          nodeId: pr.nodeId,
          queue: policy.mergeQueueRequired === true,
        }),
      );
      broadcastPrChanged(scope.pr.id, ["pr"]);
      return NextResponse.json({ ok: true });
    }
    if (action === "update_body") {
      const nextBody =
        typeof body.body === "string" ? body.body.slice(0, MAX_COMMENT_BODY_LENGTH) : "";
      if (!nextBody.trim()) {
        return NextResponse.json(
          { error: "Pull request body is required", code: "bodyRequired" },
          { status: 400 },
        );
      }
      // Read before writing, then record only a successful edit at forge time.
      let previous: string | null = null;
      try {
        const current = await scope.forge.getPullRequest(scope.call);
        previous = current.body ?? null;
      } catch {
        console.error("[pr-actions] body_edit_snapshot_read_failed");
      }
      const updated = await withPrOperation(lockTarget(scope), "update-body", () =>
        scope.forge.updatePullRequestBody({ ...call, body: nextBody }),
      );
      if (previous != null && previous !== updated.body) {
        await recordPrCommentEditQuiet({
          provider: scope.target.provider,
          repoFullName: scope.target.repoFullName,
          prNumber: scope.pr.number,
          commentId: PR_BODY_COMMENT_ID,
          body: previous,
          editedBy: actor.actor.login,
          occurredAt: updated.updatedAt,
        });
      }
      broadcastPrChanged(scope.pr.id, ["pr", "conversation"]);
      return NextResponse.json({ ok: true });
    }
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 256) : "";
    if (!title) {
      return NextResponse.json(
        { error: "Pull request title is required", code: "titleRequired" },
        { status: 400 },
      );
    }
    const updated = await withPrOperation(lockTarget(scope), "update-title", () =>
      scope.forge.updatePullRequestTitle({ ...call, title }),
    );
    const storedTitle = await shouldEncryptPullRequestContent()
      ? await encodePullRequestContent(scope.pr.id, "title", updated.title ?? title)
      : updated.title ?? title;
    await getServiceClient()
      .from("pull_requests")
      .update({ title: storedTitle, updated_at: new Date().toISOString() })
      .eq("id", scope.pr.id);
    broadcastPrChanged(scope.pr.id, ["pr", "conversation"]);
    return NextResponse.json({ ok: true, title: updated.title ?? title });
  } catch (error) {
    return prOperationErrorResponse(error);
  }
}

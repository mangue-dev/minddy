import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { createIssueForProject } from "@/lib/server/create-issue";
import { feedbackStatusForIssue } from "@/lib/server/feedback/status-sync";
import {
  emitFeedbackLinked,
  emitFeedbackPromoted,
  emitFeedbackUnlinked,
} from "@/lib/server/feedback/events";

/**
 * Promoting an issue feedback post (MIN-37) — the bridge between the board
 * and the tracker. The issue is born in the backlog unless otherwise stated by the caller
 * (the creation form, when it is a human who promotes), its
 * description carries the return and its vote counter. The post takes
 * as soon as the status says the issue, and will keep it aligned with it
 * (status-sync).
 */

export type PromoteResult =
  | { ok: true; issue: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      errorKey: "issueNotFound" | "databaseError" | "titleRequired";
    };

export async function promoteFeedbackPost(params: {
  postId: string;
  actorId: string;
  projectName?: string | null;
  /** Assigns the creation + event to the MCP agent (via_mcp) instead of the member. */
  mcpKeyId?: string | null;
  /**
 * What the human filled in the creation form before validating —
 * effort, priority, assigned, deadline, and his own title if he rewrote it.
 *
 * The returner knows none of this: he carries a need, not a plan for
 * work. What it can transmit (title, text, categories) serves as a starting point; the rest is a team judgment, and it arises at the moment of promotion rather than by reopening the ticket immediately afterwards.
 *
 * Omitted (Numo, MCP, historical calls) → the behavior before: a ticket
 * in the backlog, title and text of the return.
 */
  input?: Record<string, unknown>;
}): Promise<PromoteResult> {
  const service = getServiceClient();

  const { data: post } = await service
    .from("feedback_posts")
    .select(
      "id, project_id, title, body, vote_count, issue_id, merged_into_id, feedback_post_categories(category_id)"
    )
    .is("deleted_at", null)
    .eq("id", params.postId)
    .maybeSingle();
  // A merged or already promoted post is not promoted (the canonical has the link).
  if (!post || post.merged_into_id !== null || post.issue_id !== null) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }

  const sections: string[] = [];
  const body = (post.body as string).trim();
  if (body) sections.push(body);
  sections.push(
    `---\n\nPromoted from the feedback board · ${post.vote_count as number} vote${(post.vote_count as number) > 1 ? "s" : ""}.`
  );

  // The categories of the post are taken as is by the issue (even
  // project, so createIssueForProject resolves them all by id).
  const categoryIds = (
    (post as { feedback_post_categories?: { category_id: string }[] | null })
      .feedback_post_categories ?? []
  ).map((c) => c.category_id);

  // The form takes it field by field, and the return takes the value by
  // default of those he did not fill. `parent_id` is the only one left out:
  // creating a return ticket UNDER another ticket means nothing,
  // and the form does not offer it.
  const { parent_id: _ignored, ...override } = params.input ?? {};
  const created = await createIssueForProject({
    projectId: post.project_id as string,
    projectName: params.projectName ?? null,
    actorId: params.actorId,
    mcpKeyId: params.mcpKeyId ?? null,
    input: {
      title: post.title as string,
      description: sections.join("\n\n"),
      status: "backlog",
      category_ids: categoryIds,
      ...override,
    },
  });
  if (!created.ok) {
    return {
      ok: false,
      status: created.status,
      errorKey: created.errorKey === "titleRequired" ? "titleRequired" : "databaseError",
    };
  }

  const issueId = created.issue.id as string;
  // The status of the return is what its ticket says — including here, at the
  // second when the link is born. It was automatically “planned”, which promised
  // to the public a work planned while the ticket went to the backlog.
  const { error } = await service
    .from("feedback_posts")
    .update({
      issue_id: issueId,
      status: feedbackStatusForIssue(created.issue.status) ?? "open",
    })
    .is("deleted_at", null)
    .eq("id", params.postId)
    .is("issue_id", null);
  if (error) {
    console.error("[feedback-promote] link failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  await emitFeedbackPromoted(service, {
    postId: params.postId,
    actorId: params.actorId,
    issueId,
    mcpKeyId: params.mcpKeyId ?? null,
  });

  return { ok: true, issue: created.issue };
}

/** Links a post to an EXISTING issue (the alternative to promotion: the
 work is already tracked). The public status immediately aligns with the outcome, then tracks all its transitions via status-sync. */
export async function linkFeedbackIssue(params: {
  postId: string;
  issueId: string;
  actorId: string | null;
  mcpKeyId?: string | null;
}): Promise<
  | { ok: true }
  | { ok: false; status: number; errorKey: "issueNotFound" | "feedbackNotFound" | "databaseError" }
> {
  const service = getServiceClient();

  const { data: post } = await service
    .from("feedback_posts")
    .select("id, project_id, merged_into_id, issue_id")
    .is("deleted_at", null)
    .eq("id", params.postId)
    .maybeSingle();
  if (!post || post.merged_into_id !== null || post.issue_id !== null) {
    return { ok: false, status: 404, errorKey: "feedbackNotFound" };
  }

  const { data: issue } = await service
    .from("issues")
    .select("id, status, project_id")
    .is("deleted_at", null)
    .eq("id", params.issueId)
    .eq("project_id", post.project_id as string)
    .maybeSingle();
  if (!issue) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }

  // The SAME table as the continuous reflection (status-sync): the first alignment
  // and all subsequent ones must give the same result, otherwise link a ticket
  // and moving it a notch would say two different things about the same state.
  const status = feedbackStatusForIssue(issue.status) ?? "open";
  const { error } = await service
    .from("feedback_posts")
    .update({ issue_id: issue.id as string, status })
    .is("deleted_at", null)
    .eq("id", params.postId)
    .is("issue_id", null);
  if (error) {
    console.error("[feedback-promote] link existing failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  await emitFeedbackLinked(service, {
    postId: params.postId,
    actorId: params.actorId,
    issueId: issue.id as string,
    mcpKeyId: params.mcpKeyId ?? null,
  });
  return { ok: true };
}

/** Detaches the linked issue (the post keeps its last public status). */
export async function unlinkFeedbackIssue(
  postId: string,
  actorId: string | null,
  mcpKeyId: string | null = null
): Promise<boolean> {
  const service = getServiceClient();
  // We read the linked issue before nullifying it to name it in the thread.
  const { data: before } = await service
    .from("feedback_posts")
    .select("issue_id")
    .is("deleted_at", null)
    .eq("id", postId)
    .maybeSingle();
  const { error } = await service
    .from("feedback_posts")
    .update({ issue_id: null })
    .is("deleted_at", null)
    .eq("id", postId);
  if (error) return false;
  await emitFeedbackUnlinked(service, {
    postId,
    actorId,
    issueId: (before?.issue_id as string | null) ?? null,
    mcpKeyId,
  });
  return true;
}

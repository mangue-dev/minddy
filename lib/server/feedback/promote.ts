import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { createIssueForProject } from "@/lib/server/create-issue";

/**
 * Promotion d'un post de feedback en issue (MIN-37) — le pont entre le board
 * et le tracker. L'issue naît en backlog (le board a déjà fait la
 * qualification), sa description embarque le retour et son compteur de votes.
 * Le post passe en `planned` et son statut public suivra ensuite l'issue
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
}): Promise<PromoteResult> {
  const service = getServiceClient();

  const { data: post } = await service
    .from("feedback_posts")
    .select("id, project_id, title, body, vote_count, issue_id, merged_into_id")
    .eq("id", params.postId)
    .maybeSingle();
  // Un post mergé ou déjà promu ne se promeut pas (le canonique porte le lien).
  if (!post || post.merged_into_id !== null || post.issue_id !== null) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }

  const sections: string[] = [];
  const body = (post.body as string).trim();
  if (body) sections.push(body);
  sections.push(
    `---\n\nPromoted from the feedback board · ${post.vote_count as number} vote${(post.vote_count as number) > 1 ? "s" : ""}.`
  );

  const created = await createIssueForProject({
    projectId: post.project_id as string,
    projectName: params.projectName ?? null,
    actorId: params.actorId,
    input: {
      title: post.title as string,
      description: sections.join("\n\n"),
      status: "backlog",
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
  const { error } = await service
    .from("feedback_posts")
    .update({ issue_id: issueId, status: "planned" })
    .eq("id", params.postId)
    .is("issue_id", null);
  if (error) {
    console.error("[feedback-promote] link failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  return { ok: true, issue: created.issue };
}

/** Lie un post à une issue EXISTANTE (l'alternative à la promotion : le
    travail est déjà tracké). Le statut public s'aligne immédiatement sur
    l'issue (done→shipped, in_progress→in_progress, sinon planned) puis suivra
    ses transitions via status-sync. */
export async function linkFeedbackIssue(params: {
  postId: string;
  issueId: string;
}): Promise<
  | { ok: true }
  | { ok: false; status: number; errorKey: "issueNotFound" | "feedbackNotFound" | "databaseError" }
> {
  const service = getServiceClient();

  const { data: post } = await service
    .from("feedback_posts")
    .select("id, project_id, merged_into_id, issue_id")
    .eq("id", params.postId)
    .maybeSingle();
  if (!post || post.merged_into_id !== null || post.issue_id !== null) {
    return { ok: false, status: 404, errorKey: "feedbackNotFound" };
  }

  const { data: issue } = await service
    .from("issues")
    .select("id, status, project_id")
    .eq("id", params.issueId)
    .eq("project_id", post.project_id as string)
    .maybeSingle();
  if (!issue) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }

  const status =
    issue.status === "done"
      ? "shipped"
      : issue.status === "in_progress" || issue.status === "in_review"
        ? "in_progress"
        : issue.status === "canceled"
          ? "declined"
          : "planned";
  const { error } = await service
    .from("feedback_posts")
    .update({ issue_id: issue.id as string, status })
    .eq("id", params.postId)
    .is("issue_id", null);
  if (error) {
    console.error("[feedback-promote] link existing failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true };
}

/** Détache l'issue liée (le post garde son dernier statut public). */
export async function unlinkFeedbackIssue(postId: string): Promise<boolean> {
  const service = getServiceClient();
  const { error } = await service
    .from("feedback_posts")
    .update({ issue_id: null })
    .eq("id", postId);
  return !error;
}

import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { createIssueForProject } from "@/lib/server/create-issue";

/**
 * Promotion d'un post de feedback en issue (MIN-37) — le pont entre le board
 * et le tracker. L'issue naît en backlog (le board a déjà fait la
 * qualification), sa description embarque la racine ET les facettes avec leurs
 * compteurs : le cadrage produit arrive pré-mâché. Le post passe en `planned`
 * et son statut public suivra ensuite l'issue (status-sync).
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

  const { data: facets } = await service
    .from("feedback_facets")
    .select("text, vote_count")
    .eq("post_id", params.postId)
    .is("merged_into_id", null)
    .order("vote_count", { ascending: false });

  const sections: string[] = [];
  const body = (post.body as string).trim();
  if (body) sections.push(body);
  const facetLines = (facets ?? []).map(
    (f) => `- ${f.text as string} · ${f.vote_count as number} vote${(f.vote_count as number) > 1 ? "s" : ""}`
  );
  if (facetLines.length > 0) {
    sections.push(`## Facets\n\n${facetLines.join("\n")}`);
  }
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

/** Détache l'issue liée (le post garde son dernier statut public). */
export async function unlinkFeedbackIssue(postId: string): Promise<boolean> {
  const service = getServiceClient();
  const { error } = await service
    .from("feedback_posts")
    .update({ issue_id: null })
    .eq("id", postId);
  return !error;
}

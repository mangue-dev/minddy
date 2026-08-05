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
 * Promotion d'un post de feedback en issue (MIN-37) — le pont entre le board
 * et le tracker. L'issue naît en backlog sauf mention contraire de l'appelant
 * (le formulaire de création, quand c'est un humain qui promeut), sa
 * description embarque le retour et son compteur de votes. Le post prend
 * aussitôt le statut que dit l'issue, et le gardera aligné sur elle
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
  /** Attribue la création + l'événement à l'agent MCP (via_mcp) au lieu du membre. */
  mcpKeyId?: string | null;
  /**
   * Ce que l'humain a rempli dans le formulaire de création avant de valider —
   * effort, priorité, assigné, échéance, et son propre titre s'il l'a réécrit.
   *
   * Le retour ne sait rien de tout ça : il porte un besoin, pas un plan de
   * travail. Ce qu'il peut transmettre (titre, texte, catégories) sert de
   * point de départ ; le reste est un jugement d'équipe, et il se pose au
   * moment de promouvoir plutôt qu'en rouvrant le ticket juste après.
   *
   * Omis (Numo, MCP, appels historiques) → le comportement d'avant : un ticket
   * au backlog, titre et texte du retour.
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

  // Les catégories du post sont reprises telles quelles par l'issue (même
  // projet, donc createIssueForProject les résout toutes par id).
  const categoryIds = (
    (post as { feedback_post_categories?: { category_id: string }[] | null })
      .feedback_post_categories ?? []
  ).map((c) => c.category_id);

  // Le formulaire l'emporte champ par champ, et le retour tient la valeur par
  // défaut de ceux qu'il n'a pas remplis. `parent_id` est le seul écarté :
  // faire naître le ticket d'un retour SOUS un autre ticket ne veut rien dire,
  // et le formulaire ne le propose pas.
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
  // Le statut du retour est celui que dit son ticket — y compris ici, à la
  // seconde où le lien naît. Il valait « planned » d'office, ce qui promettait
  // au public un travail prévu alors que le ticket partait au backlog.
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

/** Lie un post à une issue EXISTANTE (l'alternative à la promotion : le
    travail est déjà tracké). Le statut public s'aligne immédiatement sur
    l'issue, puis suit toutes ses transitions via status-sync. */
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

  // La MÊME table que le reflet continu (status-sync) : le premier alignement
  // et tous les suivants doivent donner le même résultat, sinon lier un ticket
  // et le bouger d'un cran diraient deux choses différentes du même état.
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

/** Détache l'issue liée (le post garde son dernier statut public). */
export async function unlinkFeedbackIssue(
  postId: string,
  actorId: string | null,
  mcpKeyId: string | null = null
): Promise<boolean> {
  const service = getServiceClient();
  // On lit l'issue liée avant de la nul­ler pour la nommer dans le fil.
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

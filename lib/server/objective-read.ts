import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { displayName } from "@/lib/display-name";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";
import { decodeAttachmentRow } from "@/lib/server/attachment-content";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { commentStore } from "@/lib/server/comment-store";
import { resolveEntityRelations, type ResolvedEntityRelation } from "@/lib/server/issue-reads";
import { objectiveStore } from "@/lib/server/objective-store";
import { resourceSummary } from "@/lib/server/resource-select";

type Row = Record<string, unknown>;

/** A comment of the objective's thread, as both agent surfaces show it. */
export interface ObjectiveCommentView {
  id: unknown;
  author: string;
  body: unknown;
  parent_id: unknown;
  created_at: unknown;
  resources?: Record<string, unknown>[];
}

export type ObjectiveRelationView =
  | { relation: string; objective_id: string; name: unknown; status: unknown; lead_user_id: unknown }
  | { relation: string; issue_id: string; identifier: string; title: unknown; status: unknown };

export type ObjectiveRead<T> =
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "database_error"; message: string }
  | { ok: false; reason: "comments_error" }
  | {
      ok: true;
      objective: Row;
      comments: ObjectiveCommentView[];
      /** Resources attached to the objective itself, not to one of its comments. */
      resources: Record<string, unknown>[];
      relations: ObjectiveRelationView[];
      extras: T;
    };

/**
 * One objective of a project with its comment thread (MIN-793), its resources
 * and its relations (MIN-513): the read Numo's get_objective and the MCP's
 * minddy_get_objective share. `client` is the caller's authorized client (the
 * user's RLS client for Numo, the service client behind the MCP's project
 * check); `authUsers` resolves author names. `extras` runs alongside the
 * thread reads once the objective is known to exist, for what only one
 * surface shows.
 */
export async function readObjective<T>(
  client: SupabaseClient,
  authUsers: SupabaseClient,
  input: { projectId: string; projectKey: string; objectiveId: string; actorId: string; columns: string },
  extras: (objective: Row) => Promise<T>,
): Promise<ObjectiveRead<T>> {
  const { data: objective, error } = await objectiveStore(client)
    .select(input.columns)
    .is("deleted_at", null)
    .eq("project_id", input.projectId)
    .eq("id", input.objectiveId)
    .maybeSingle();
  if (error) return { ok: false, reason: "database_error", message: error.message };
  if (!objective) return { ok: false, reason: "not_found" };

  const objectiveId = objective.id as string;
  const [{ data: comments, error: commentsError }, { data: attachmentRows }, relations, extra] = await Promise.all([
    commentStore(client, "comments", input.actorId)
      .select("id, author_id, body, parent_id, via_assistant, via_mcp, api_key_id, created_at")
      .eq("objective_id", objectiveId)
      .order("created_at", { ascending: true }),
    client
      .from("attachments")
      .select(
        "id, comment_id, kind, url, page_id, file_name, mime_type, size_bytes, page:pages(id, project_id, title, encrypted_content, encryption_version)",
      )
      .eq("objective_id", objectiveId)
      .order("created_at", { ascending: true }),
    resolveEntityRelations(client, { projectId: input.projectId, projectKey: input.projectKey }, objectiveId),
    extras(objective),
  ]);
  if (commentsError) return { ok: false, reason: "comments_error" };

  // `comment_id` null = carried by the objective itself, as on an issue.
  const resourcesByComment = new Map<string | null, Record<string, unknown>[]>();
  for (const stored of attachmentRows ?? []) {
    const row = await decodeAttachmentRow("attachments", stored, input.actorId, input.projectId);
    const key = (row.comment_id as string | null) ?? null;
    const list = resourcesByComment.get(key) ?? [];
    list.push(resourceSummary(row));
    resourcesByComment.set(key, list);
  }

  // A comment an agent wrote through a key is attributed to that key, not to
  // the key's owner.
  const [authors, keyActors] = await Promise.all([
    fetchAuthUsersById(authUsers, (comments ?? []).map((c) => c.author_id as string)),
    resolveApiKeyActors((comments ?? []).map((c) => c.api_key_id as string | null)),
  ]);

  return {
    ok: true,
    objective,
    comments: (comments ?? []).map((c) => {
      const resources = resourcesByComment.get(c.id as string);
      return {
        id: c.id,
        author: c.via_assistant
          ? "Numo"
          : c.via_mcp
            ? `${keyActors.get(c.api_key_id as string)?.name ?? "Agent"} (mcp)`
            : displayName(toNamed(authors.get(c.author_id as string)), "User"),
        body: c.body,
        parent_id: c.parent_id,
        created_at: c.created_at,
        ...(resources ? { resources } : {}),
      };
    }),
    resources: resourcesByComment.get(null) ?? [],
    relations: relations.map(objectiveRelationView),
    extras: extra,
  };
}

function objectiveRelationView(r: ResolvedEntityRelation): ObjectiveRelationView {
  return r.kind === "objective"
    ? {
        relation: r.relation,
        objective_id: r.other.id,
        name: r.other.name,
        status: r.other.status,
        lead_user_id: r.other.lead_user_id,
      }
    : {
        relation: r.relation,
        issue_id: r.other.id,
        identifier: r.other.identifier,
        title: r.other.title,
        status: r.other.status,
      };
}

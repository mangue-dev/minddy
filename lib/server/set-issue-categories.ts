import { issueStore } from "@/lib/server/issue-store";
import "server-only";
import { scheduleRoutineEvents } from "@/lib/server/routine-hooks";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  insertEvents,
  stampForgeSync,
  stampViaAssistant,
  stampMcpKey,
  type EventRow,
} from "@/lib/server/issue-events";
import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * Shared category-assignment core: replaces the issue's category set (full
 * replace — ids not sent are removed) atomically through the
 * `replace_issue_categories` function, keeping only ids that belong to the
 * issue's project, and logs category_added / category_removed events. Used by
 * PUT /api/issues/[id]/categories and the assistant tools.
 *
 * Access is enforced HERE (the write bypasses RLS): the actor must be able to
 * access the issue's project, otherwise the issue is reported as not found —
 * the same signal RLS invisibility gives.
 */
export type SetCategoriesResult =
  | { ok: true; categoryIds: string[] }
  | {
      ok: false;
      status: number;
      /** Key into the ApiErrors i18n namespace (mutually exclusive with rawMessage). */
      errorKey?: "issueNotFound" | "readOnlyProject" | "databaseError";
      /** Verbatim DB message already meant for the user. */
      rawMessage?: string;
    };

export async function setIssueCategories({
  issueId,
  actorId,
  categoryIds,
  viaAssistant = false,
  mcpKeyId = null,
  forgeSync = null,
}: {
  issueId: string;
  actorId: string;
  categoryIds: string[];
  /** Marks the resulting activity events as triggered through Numo. */
  viaAssistant?: boolean;
  /** Attributes the resulting activity events to an MCP API key (agent actor). */
  mcpKeyId?: string | null;
  /** Assigns events to the forge when the categories come from
 LABELS from a remote issue (synchronized with a linked repository): `actorId` remains
 the owner who technically carries the writing, the timeline displays
 GitHub/GitLab — same rule as `updateIssueFields`. */
  forgeSync?: RepoProviderId | null;
}): Promise<SetCategoriesResult> {
  const requested = categoryIds.filter((v): v is string => typeof v === "string");

  const service = getServiceClient();

  const { data: issue, error: issueError } = await issueStore(service).select("id, project_id")
    .is("deleted_at", null)
    .eq("id", issueId)
    .maybeSingle();
  if (issueError) {
    console.error("[set-issue-categories] issue lookup failed:", issueError.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!issue) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }
  const access = await getProjectAccess(actorId, issue.project_id as string);
  if (!access) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }
  if (!access.canWrite) {
    return { ok: false, status: 403, errorKey: "readOnlyProject" };
  }

  // One transaction (MIN-698): the function locks the issue, keeps only ids
  // that belong to its project, writes the difference and returns it. A
  // failure leaves the previous set untouched, and concurrent replacements of
  // the same issue are serialized, so the last one leaves exactly its set.
  const { data, error: replaceError } = await service.rpc("replace_issue_categories", {
    p_issue_id: issueId,
    p_actor_id: actorId,
    p_category_ids: requested,
  });
  if (replaceError) {
    if (replaceError.code === "42501") return { ok: false, status: 403, errorKey: "readOnlyProject" };
    console.error("[set-issue-categories] replace failed:", replaceError.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const outcome = data as
    | { code: string }
    | { category_ids: string[]; added: string[]; removed: string[] }
    | null;
  if (!outcome || "code" in outcome) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }

  scheduleRoutineEvents();
  // Activity reflects the committed difference only.
  const events: EventRow[] = [
    ...outcome.added.map((cid): EventRow => (
      { issue_id: issueId, actor_id: actorId, type: "category_added", to_value: cid }
    )),
    ...outcome.removed.map((cid): EventRow => (
      { issue_id: issueId, actor_id: actorId, type: "category_removed", from_value: cid }
    )),
  ];
  await insertEvents(
    service,
    stampForgeSync(
      stampMcpKey(stampViaAssistant(events, viaAssistant), mcpKeyId),
      forgeSync
    )
  );

  return { ok: true, categoryIds: outcome.category_ids };
}

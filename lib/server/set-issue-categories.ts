import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  insertEvents,
  stampViaAssistant,
  stampViaMcp,
  type EventRow,
} from "@/lib/server/issue-events";

/**
 * Shared category-assignment core: replaces the issue's category set (full
 * replace — ids not sent are removed), keeping only ids that belong to the
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
      errorKey?: "issueNotFound" | "databaseError";
      /** Verbatim DB message already meant for the user. */
      rawMessage?: string;
    };

export async function setIssueCategories({
  issueId,
  actorId,
  categoryIds,
  viaAssistant = false,
  viaMcp = false,
}: {
  issueId: string;
  actorId: string;
  categoryIds: string[];
  /** Marks the resulting activity events as triggered through Numo. */
  viaAssistant?: boolean;
  /** Marks the resulting activity events as triggered through the MCP endpoint. */
  viaMcp?: boolean;
}): Promise<SetCategoriesResult> {
  const requested = categoryIds.filter((v): v is string => typeof v === "string");

  const service = getServiceClient();

  const { data: issue } = await service
    .from("issues")
    .select("id, project_id")
    .eq("id", issueId)
    .maybeSingle();
  if (!issue) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }
  const access = await getProjectAccess(actorId, issue.project_id as string);
  if (!access) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }

  // Keep only categories that actually belong to this issue's project.
  let valid: string[] = [];
  if (requested.length > 0) {
    const { data: cats } = await service
      .from("categories")
      .select("id")
      .eq("project_id", issue.project_id)
      .in("id", requested);
    valid = (cats ?? []).map((c) => c.id as string);
  }

  // Snapshot the current set so we can log which categories were added/removed.
  const { data: currentRows } = await service
    .from("issue_categories")
    .select("category_id")
    .eq("issue_id", issueId);
  const current = new Set((currentRows ?? []).map((r) => r.category_id as string));

  const { error: delError } = await service
    .from("issue_categories")
    .delete()
    .eq("issue_id", issueId);
  if (delError) {
    console.error("[set-issue-categories] clear failed:", delError.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  if (valid.length > 0) {
    // upsert + ignoreDuplicates: tolerate a concurrent request having already
    // inserted the same (issue_id, category_id) pair, so it can't 500 on the
    // join table's primary key.
    const { error: insError } = await service
      .from("issue_categories")
      .upsert(valid.map((category_id) => ({ issue_id: issueId, category_id })), {
        onConflict: "issue_id,category_id",
        ignoreDuplicates: true,
      });
    if (insError) {
      console.error("[set-issue-categories] set failed:", insError.message);
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
  }

  // Activity: one event per added / removed category.
  const nextSet = new Set(valid);
  const events: EventRow[] = [];
  for (const cid of valid) {
    if (!current.has(cid)) {
      events.push({ issue_id: issueId, actor_id: actorId, type: "category_added", to_value: cid });
    }
  }
  for (const cid of current) {
    if (!nextSet.has(cid)) {
      events.push({ issue_id: issueId, actor_id: actorId, type: "category_removed", from_value: cid });
    }
  }
  await insertEvents(service, stampViaMcp(stampViaAssistant(events, viaAssistant), viaMcp));

  return { ok: true, categoryIds: valid };
}

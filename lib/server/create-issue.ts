import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isEffort, isPriority, isStatus, isDateOrNull } from "@/lib/issue-validation";
import { insertEvents, stampViaAssistant, type EventRow } from "@/lib/server/issue-events";

/**
 * Shared issue-creation core: builds the row from an untrusted input payload,
 * assigns the CLÉ-number atomically, inserts via the service client, attaches
 * categories and records activity events. Used by POST /api/projects/[id]/issues
 * and by the triage accept route.
 *
 * Callers MUST have verified the actor's access to the project beforehand —
 * the insert bypasses RLS.
 */
export type CreateIssueResult =
  | { ok: true; issue: Record<string, unknown> & { category_ids: string[] } }
  | {
      ok: false;
      status: number;
      /** Key into the ApiErrors i18n namespace (mutually exclusive with rawMessage). */
      errorKey?:
        | "titleRequired"
        | "parentIssueNotFound"
        | "nestingLimitedToOneLevel"
        | "databaseError";
      /** Verbatim DB message already meant for the user (P0001 trigger raise). */
      rawMessage?: string;
    };

export async function createIssueForProject({
  projectId,
  actorId,
  input,
  viaAssistant = false,
}: {
  projectId: string;
  actorId: string;
  input: Record<string, unknown>;
  /** Marks the resulting activity events as triggered through Numo. */
  viaAssistant?: boolean;
}): Promise<CreateIssueResult> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) {
    return { ok: false, status: 400, errorKey: "titleRequired" };
  }

  const row: Record<string, unknown> = {
    project_id: projectId,
    title,
    created_by: actorId,
    position: Date.now(),
  };
  if (typeof input.description === "string") row.description = input.description;
  if (isStatus(input.status)) {
    row.status = input.status;
    if (input.status === "done") row.completed_at = new Date().toISOString();
  }
  if (isPriority(input.priority)) row.priority = input.priority;
  if (input.effort === null || isEffort(input.effort)) row.effort = input.effort ?? null;
  if (typeof input.assignee_id === "string" || input.assignee_id === null) {
    row.assignee_id = input.assignee_id ?? null;
  }
  if (typeof input.objective_id === "string" || input.objective_id === null) {
    row.objective_id = input.objective_id ?? null;
  }
  if (isDateOrNull(input.due_date)) row.due_date = input.due_date;

  const service = getServiceClient();

  // Sub-issue: validate the parent (same project, top-level) and, unless an
  // objective was explicitly set, inherit the parent's objective (plan §4).
  if (typeof input.parent_id === "string") {
    const { data: parent } = await service
      .from("issues")
      .select("id, project_id, parent_id, objective_id")
      .eq("id", input.parent_id)
      .maybeSingle();
    if (!parent || parent.project_id !== projectId) {
      return { ok: false, status: 400, errorKey: "parentIssueNotFound" };
    }
    if (parent.parent_id) {
      return { ok: false, status: 400, errorKey: "nestingLimitedToOneLevel" };
    }
    row.parent_id = input.parent_id;
    if (!("objective_id" in input)) row.objective_id = parent.objective_id;
  }

  const { data: number, error: counterError } = await service.rpc("next_issue_number", {
    p_project_id: projectId,
  });
  if (counterError || typeof number !== "number") {
    console.error("[create-issue] counter failed:", counterError?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  row.number = number;

  const { data, error } = await service
    .from("issues")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    if (error.code === "P0001") {
      return { ok: false, status: 400, rawMessage: error.message };
    }
    console.error("[create-issue] create failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  // Attach categories (only those that belong to this project).
  let categoryIds: string[] = [];
  const requested = Array.isArray(input.category_ids)
    ? input.category_ids.filter((v): v is string => typeof v === "string")
    : [];
  if (requested.length > 0) {
    const { data: cats } = await service
      .from("categories")
      .select("id")
      .eq("project_id", projectId)
      .in("id", requested);
    categoryIds = (cats ?? []).map((c) => c.id as string);
    if (categoryIds.length > 0) {
      await service
        .from("issue_categories")
        .insert(categoryIds.map((category_id) => ({ issue_id: data.id, category_id })));
    }
  }

  // Activity: creation + "sub-issue added" on the parent.
  const events: EventRow[] = [
    { issue_id: data.id, actor_id: actorId, type: "created" },
  ];
  if (data.parent_id) {
    events.push({
      issue_id: data.parent_id,
      actor_id: actorId,
      type: "sub_issue_added",
      to_value: data.id,
    });
  }
  await insertEvents(service, stampViaAssistant(events, viaAssistant));

  return { ok: true, issue: { ...data, category_ids: categoryIds } };
}

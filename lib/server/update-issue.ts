import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isEffort, isPriority, isStatus, isDateOrNull } from "@/lib/issue-validation";
import { getProjectAccess } from "@/lib/server/project-access";
import { ISSUE_SELECT, mapIssueRow } from "@/lib/server/issue-mapper";
import {
  buildFieldChangeEvents,
  insertEvents,
  type EventRow,
} from "@/lib/server/issue-events";
import { insertNotifications } from "@/lib/server/notifications";

/**
 * Shared issue-update core: validates an untrusted field payload, applies it
 * via the service client, records field-level activity events and notifies a
 * newly-assigned user. Used by PATCH /api/issues/[id] and the assistant tools.
 *
 * Access is enforced HERE (the write bypasses RLS): the actor must be able to
 * access the issue's project, otherwise the issue is reported as not found —
 * the same signal RLS invisibility gives.
 */
export type UpdateIssueResult =
  | { ok: true; issue: Record<string, unknown> & { category_ids: string[] } }
  | {
      ok: false;
      status: number;
      /** Key into the ApiErrors i18n namespace (mutually exclusive with rawMessage). */
      errorKey?:
        | "titleRequired"
        | "invalidStatus"
        | "invalidPriority"
        | "invalidEffort"
        | "invalidDate"
        | "invalidPosition"
        | "noFieldsToUpdate"
        | "issueNotFound"
        | "databaseError";
      /** Verbatim DB message already meant for the user (P0001 trigger raise). */
      rawMessage?: string;
    };

export async function updateIssueFields({
  issueId,
  actorId,
  input,
}: {
  issueId: string;
  actorId: string;
  input: Record<string, unknown>;
}): Promise<UpdateIssueResult> {
  const updates: Record<string, unknown> = {};

  if (typeof input.title === "string") {
    const title = input.title.trim();
    if (!title) {
      return { ok: false, status: 400, errorKey: "titleRequired" };
    }
    updates.title = title;
  }
  if ("description" in input) {
    updates.description =
      typeof input.description === "string" ? input.description : null;
  }
  if ("status" in input) {
    if (!isStatus(input.status)) {
      return { ok: false, status: 400, errorKey: "invalidStatus" };
    }
    updates.status = input.status;
    // Keep completed_at in sync with the done state.
    updates.completed_at = input.status === "done" ? new Date().toISOString() : null;
  }
  if ("priority" in input) {
    if (!isPriority(input.priority)) {
      return { ok: false, status: 400, errorKey: "invalidPriority" };
    }
    updates.priority = input.priority;
  }
  if ("effort" in input) {
    if (input.effort !== null && !isEffort(input.effort)) {
      return { ok: false, status: 400, errorKey: "invalidEffort" };
    }
    updates.effort = input.effort ?? null;
  }
  if ("assignee_id" in input) {
    updates.assignee_id =
      typeof input.assignee_id === "string" ? input.assignee_id : null;
  }
  if ("objective_id" in input) {
    updates.objective_id =
      typeof input.objective_id === "string" ? input.objective_id : null;
  }
  if ("parent_id" in input) {
    // The one-level / same-project invariant is enforced by a DB trigger; a
    // violation surfaces below as a friendly 400 (P0001).
    updates.parent_id =
      typeof input.parent_id === "string" ? input.parent_id : null;
  }
  if ("duplicate_of_id" in input) {
    updates.duplicate_of_id =
      typeof input.duplicate_of_id === "string" ? input.duplicate_of_id : null;
  }
  if ("due_date" in input) {
    if (!isDateOrNull(input.due_date)) {
      return { ok: false, status: 400, errorKey: "invalidDate" };
    }
    updates.due_date = input.due_date;
  }
  if ("position" in input) {
    if (typeof input.position !== "number" || !Number.isFinite(input.position)) {
      return { ok: false, status: 400, errorKey: "invalidPosition" };
    }
    updates.position = input.position;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, errorKey: "noFieldsToUpdate" };
  }

  const service = getServiceClient();

  // Snapshot before the change: it resolves the project for the access check
  // and is the baseline we diff into activity events.
  const { data: before } = await service
    .from("issues")
    .select("*")
    .eq("id", issueId)
    .maybeSingle();
  if (!before) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }
  const access = await getProjectAccess(actorId, before.project_id as string);
  if (!access) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }

  const { data, error } = await service
    .from("issues")
    .update(updates)
    .eq("id", issueId)
    .select(ISSUE_SELECT)
    .maybeSingle();

  if (error) {
    // Trigger-raised invariant (sub-issue nesting) → friendly 400.
    if (error.code === "P0001") {
      return { ok: false, status: 400, rawMessage: error.message };
    }
    console.error("[update-issue] update failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }

  // Activity log (best-effort, service client).
  const events = buildFieldChangeEvents(issueId, actorId, before, updates);
  if ("parent_id" in updates && (updates.parent_id ?? null) !== (before.parent_id ?? null)) {
    events.push({
      issue_id: issueId,
      actor_id: actorId,
      type: "updated",
      field: "parent",
      from_value: (before.parent_id as string) ?? null,
      to_value: (updates.parent_id as string) ?? null,
    });
    if (before.parent_id) {
      events.push({
        issue_id: before.parent_id as string,
        actor_id: actorId,
        type: "sub_issue_removed",
        to_value: issueId,
      });
    }
    if (updates.parent_id) {
      events.push({
        issue_id: updates.parent_id as string,
        actor_id: actorId,
        type: "sub_issue_added",
        to_value: issueId,
      });
    }
  }
  await insertEvents(service, events as EventRow[]);

  // Notify a newly-assigned user (never on self-assign).
  const newAssignee = updates.assignee_id as string | undefined;
  if (
    "assignee_id" in updates &&
    newAssignee &&
    newAssignee !== before.assignee_id &&
    newAssignee !== actorId
  ) {
    await insertNotifications(service, [
      {
        user_id: newAssignee,
        project_id: (before.project_id as string) ?? null,
        type: "assigned",
        issue_id: issueId,
        actor_id: actorId,
      },
    ]);
  }

  return { ok: true, issue: mapIssueRow(data) };
}

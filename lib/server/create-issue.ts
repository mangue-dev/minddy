import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { isEffort, isPriority, isStatus, isDateOrNull } from "@/lib/issue-validation";
import { MAX_PLAN_LENGTH } from "@/lib/plan";
import {
  copyAttachmentsToProject,
  insertAttachments,
  parseAttachmentsInput,
} from "@/lib/server/attachments";
import {
  insertEvents,
  stampIntegration,
  stampViaAssistant,
  stampMcpKey,
  type EventRow,
} from "@/lib/server/issue-events";
import { insertStatEvents, type StatEventRow } from "@/lib/server/stat-events";
import {
  isSmartAssignEligibleStatus,
  scheduleSmartAssign,
} from "@/lib/server/smart-assign";

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
        | "planTooLong"
        | "databaseError"
        | "attachmentInvalid";
      /** Verbatim DB message already meant for the user (P0001 trigger raise). */
      rawMessage?: string;
    };

export async function createIssueForProject({
  projectId,
  projectName = null,
  actorId,
  input,
  viaAssistant = false,
  mcpKeyId = null,
  integrationId = null,
}: {
  projectId: string;
  /** Project name snapshot for the stats ledger (survives project deletion). */
  projectName?: string | null;
  /** NULL when the issue comes from an integration (no user behind it). */
  actorId: string | null;
  input: Record<string, unknown>;
  /** Marks the resulting activity events as triggered through Numo. */
  viaAssistant?: boolean;
  /** Attributes the resulting activity events to an MCP API key (agent actor). */
  mcpKeyId?: string | null;
  /** Attributes the issue and its events to a project integration. */
  integrationId?: string | null;
}): Promise<CreateIssueResult> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) {
    return { ok: false, status: 400, errorKey: "titleRequired" };
  }

  // Files the client already uploaded under this project's storage prefix.
  const parsedAttachments = parseAttachmentsInput(
    input.attachments,
    `projects/${projectId}/`
  );
  if (parsedAttachments === null) {
    return { ok: false, status: 400, errorKey: "attachmentInvalid" };
  }

  // Cross-project creation: files uploaded under another project's prefix, to be
  // COPIED into this one. Validated with the generic `projects/` family here;
  // per-file source access is checked at copy time (copyAttachmentsToProject).
  const parsedCopyAttachments = parseAttachmentsInput(
    input.copy_attachments,
    "projects/"
  );
  if (parsedCopyAttachments === null) {
    return { ok: false, status: 400, errorKey: "attachmentInvalid" };
  }

  const row: Record<string, unknown> = {
    project_id: projectId,
    title,
    created_by: actorId,
    position: Date.now(),
  };
  if (integrationId) row.integration_id = integrationId;
  if (typeof input.description === "string") row.description = input.description;
  if (typeof input.plan === "string" && input.plan.trim()) {
    if (input.plan.length > MAX_PLAN_LENGTH) {
      return { ok: false, status: 400, errorKey: "planTooLong" };
    }
    row.plan = input.plan;
  }
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

  // An assignee must belong to the target project. Cross-project creation may
  // carry an assignee_id whose user isn't a member here — drop it rather than
  // assign a stranger. (Same-project assignees are picked from the project's
  // own member list, so this is a no-op there.)
  if (typeof row.assignee_id === "string") {
    const assigneeAccess = await getProjectAccess(row.assignee_id, projectId);
    if (!assigneeAccess) row.assignee_id = null;
  }

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

  // Attachment rows — the issue exists from here on, so a failure must not
  // fail the request (the files just don't get registered). Cross-project files
  // are copied into this project's storage prefix first, then registered
  // alongside the local ones.
  try {
    const copied = await copyAttachmentsToProject(service, {
      targetProjectId: projectId,
      actorId,
      attachments: parsedCopyAttachments,
    });
    await insertAttachments(service, {
      projectId,
      issueId: data.id as string,
      commentId: null,
      createdBy: actorId,
      attachments: [...parsedAttachments, ...copied],
    });
  } catch (e) {
    console.error("[create-issue] attachments failed:", (e as Error).message);
  }

  // Attach categories that belong to this project — matched by ID (same-project
  // creation) and/or by NAME (cross-project creation carries names, since a
  // category ID is scoped to one project). The DB filter on project_id keeps
  // foreign values out either way.
  let categoryIds: string[] = [];
  const requestedIds = Array.isArray(input.category_ids)
    ? input.category_ids.filter((v): v is string => typeof v === "string")
    : [];
  const requestedNames = Array.isArray(input.category_names)
    ? input.category_names.filter((v): v is string => typeof v === "string")
    : [];
  if (requestedIds.length > 0 || requestedNames.length > 0) {
    const resolved = new Set<string>();
    if (requestedIds.length > 0) {
      const { data: cats } = await service
        .from("categories")
        .select("id")
        .eq("project_id", projectId)
        .in("id", requestedIds);
      (cats ?? []).forEach((c) => resolved.add(c.id as string));
    }
    if (requestedNames.length > 0) {
      const { data: cats } = await service
        .from("categories")
        .select("id")
        .eq("project_id", projectId)
        .in("name", requestedNames);
      (cats ?? []).forEach((c) => resolved.add(c.id as string));
    }
    categoryIds = [...resolved];
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
  await insertEvents(
    service,
    stampIntegration(
      stampMcpKey(stampViaAssistant(events, viaAssistant), mcpKeyId),
      integrationId
    )
  );

  // Ledger de stats : une contribution "créée" (et "terminée" si créée
  // directement en done) au nom de l'acteur. Skip pour les issues d'intégration
  // (actorId null) — elles n'appartiennent à aucun utilisateur.
  if (actorId) {
    const snapshot = {
      project_id: projectId,
      project_name: projectName,
      issue_id: data.id as string,
      issue_number: data.number as number,
      issue_title: data.title as string,
    };
    const statRows: StatEventRow[] = [
      { user_id: actorId, kind: "issue_created", occurred_at: data.created_at as string, ...snapshot },
    ];
    if (data.status === "done") {
      statRows.push({
        user_id: actorId,
        kind: "issue_completed",
        occurred_at: (data.completed_at as string) ?? (data.created_at as string),
        ...snapshot,
      });
    }
    await insertStatEvents(service, statRows);
  }

  // Smart Assign (MIN-31): an issue born past triage without an assignee gets
  // one after the response (opt-in per project; the run re-checks everything).
  // Integration issues are forced to "triage" by their routes, so never match.
  if (data.assignee_id == null && isSmartAssignEligibleStatus(data.status)) {
    scheduleSmartAssign({
      issueId: data.id as string,
      projectId,
      triggerActorId: actorId,
      trigger: "create",
    });
  }

  return { ok: true, issue: { ...data, category_ids: categoryIds } };
}

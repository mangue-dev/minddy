import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { userInProject } from "@/lib/server/tenancy";
import { OBJECTIVE_STATUS_VALUES } from "@/lib/objective-constants";
import { isDateOrNull } from "@/lib/issue-validation";
import { isValidColor } from "@/lib/category-colors";
import { notifyDescriptionMentions } from "@/lib/server/description-mentions";
import { queuePageLinks } from "@/lib/server/page-links";
import {
  copyResourcesToProject,
  insertAttachments,
  parseResourcesInput,
} from "@/lib/server/attachments";
import {
  buildObjectiveFieldChangeEvents,
  insertEvents,
  stampMcpKey,
  stampViaAssistant,
  type EventRow,
} from "@/lib/server/issue-events";

/**
 * Shared objective core (create + update), used by POST /api/projects/[id]/objectives,
 * PATCH /api/objectives/[id] and the assistant tools.
 *
 * Access is enforced HERE (the writes bypass RLS): the actor must be able to
 * access the project, otherwise the target is reported as not found — the
 * same signal RLS invisibility gives.
 */
export type ObjectiveResult =
  | { ok: true; objective: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      /** Key into the ApiErrors i18n namespace (mutually exclusive with rawMessage). */
      errorKey?:
        | "nameRequired"
        | "invalidStatus"
        | "invalidDate"
        | "invalidColor"
        | "resourceInvalid"
        | "noFieldsToUpdate"
        | "projectNotFound"
        | "objectiveNotFound"
        | "notAProjectMember"
        | "databaseError";
      /** Verbatim DB message already meant for the user. */
      rawMessage?: string;
    };

// Length limits (MIN-118): same name limit as ticket titles;
// the description is free markdown, bounded like the plan. Beyond that we truncate.
const MAX_NAME_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 65_536;

function objectiveGuardError(message: string):
  | "forbidden"
  | "notFound"
  | "leadForbidden"
  | null {
  if (message.includes("tenant_guard_forbidden")) return "forbidden";
  if (message.includes("objective_not_found")) return "notFound";
  if (message.includes("objective_lead_forbidden")) return "leadForbidden";
  return null;
}

export async function createObjective({
  projectId,
  actorId,
  input,
  viaAssistant = false,
  mcpKeyId = null,
}: {
  projectId: string;
  actorId: string;
  input: Record<string, unknown>;
  /** Assigns the “created” event to Numo in the activity feed. */
  viaAssistant?: boolean;
  /** Assigns the event to an MCP (agent) key instead of the user. */
  mcpKeyId?: string | null;
}): Promise<ObjectiveResult> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    return { ok: false, status: 400, errorKey: "nameRequired" };
  }

  const row: Record<string, unknown> = {
    name: name.slice(0, MAX_NAME_LENGTH),
  };
  if (typeof input.description === "string") {
    row.description = input.description.slice(0, MAX_DESCRIPTION_LENGTH);
  }
  if (
    typeof input.status === "string" &&
    OBJECTIVE_STATUS_VALUES.includes(input.status as never)
  ) {
    row.status = input.status;
  }
  if (typeof input.lead_user_id === "string" || input.lead_user_id === null) {
    row.lead_user_id = input.lead_user_id ?? null;
  }
  if (isDateOrNull(input.target_date)) row.target_date = input.target_date;
  // The color comes from the category palette (hex #rrggbb) — a value
  // out of format is ignored, as an unknown status.
  if (isValidColor(input.color) || input.color === null) {
    row.color = input.color ?? null;
  }

  // Resources for the new objective: files the client already uploaded under
  // this project's storage prefix (plus, for cross-project creation, those
  // uploaded under another project's, copied here first — same two-list scheme
  // as create-issue) and links /link-preview already resolved.
  const parsedResources = parseResourcesInput(
    input.resources,
    `projects/${projectId}/`
  );
  if (parsedResources === null) {
    return { ok: false, status: 400, errorKey: "resourceInvalid" };
  }
  const parsedCopyResources = parseResourcesInput(
    input.copy_resources,
    "projects/"
  );
  if (parsedCopyResources === null) {
    return { ok: false, status: 400, errorKey: "resourceInvalid" };
  }

  const access = await getProjectAccess(actorId, projectId);
  if (!access) {
    return { ok: false, status: 404, errorKey: "projectNotFound" };
  }

  const service = getServiceClient();

  // The MANAGER is an outgoing reference like any other (MIN-339): without
  // this guard, `lead_user_id` accepts any account on the platform
  // and the lens displays — on the entire project screen — someone's name
  // which is not there.
  if (typeof row.lead_user_id === "string") {
    const isMember = await userInProject(
      service,
      row.lead_user_id,
      projectId,
      access.project.owner_id
    );
    if (!isMember) {
      return { ok: false, status: 400, errorKey: "notAProjectMember" };
    }
  }

  // The service role bypasses RLS. The RPC locks the project, re-checks the
  // actor and lead membership, and inserts before that authorization can be
  // revoked by a concurrent membership write.
  const { data, error } = await service.rpc("create_objective_guarded", {
    p_project_id: projectId,
    p_actor_id: actorId,
    p_values: row,
  });

  if (error) {
    const guard = objectiveGuardError(error.message);
    if (guard === "forbidden") {
      return { ok: false, status: 404, errorKey: "projectNotFound" };
    }
    if (guard === "leadForbidden") {
      return { ok: false, status: 400, errorKey: "notAProjectMember" };
    }
    console.error("[objectives] create failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  const createdObjective = data as Record<string, unknown>;

  // Resource rows — the objective exists from here on, so a failure must not
  // fail the request (the resources just don't get registered).
  try {
    const copied = await copyResourcesToProject(service, {
      targetProjectId: projectId,
      actorId,
      resources: parsedCopyResources,
    });
    await insertAttachments(service, {
      projectId,
      objectiveId: createdObjective.id as string,
      commentId: null,
      createdBy: actorId,
      resources: [...parsedResources, ...copied],
    });
  } catch (e) {
    console.error("[objectives] resources failed:", (e as Error).message);
  }

  const created: EventRow[] = [
    {
      objective_id: createdObjective.id as string,
      actor_id: actorId,
      type: "created",
    },
  ];
  await insertEvents(
    service,
    stampMcpKey(stampViaAssistant(created, viaAssistant), mcpKeyId)
  );

  // The people mentioned in the description of the objective that has just been born.
  await notifyDescriptionMentions(service, {
    projectId,
    actorId,
    description: createdObjective.description as string | null,
    objectiveId: createdObjective.id as string,
    mcpKeyId,
    viaAssistant,
  });

  // And the pages she cites (MIN-279).
  queuePageLinks(
    service,
    { kind: "objective", id: createdObjective.id as string, projectId },
    createdObjective.description as string | null
  );

  return { ok: true, objective: createdObjective };
}

export async function updateObjective({
  objectiveId,
  actorId,
  input,
  viaAssistant = false,
  mcpKeyId = null,
}: {
  objectiveId: string;
  actorId: string;
  input: Record<string, unknown>;
  /** Assigns change events to Numo in the activity feed. */
  viaAssistant?: boolean;
  /** Assigns events to an MCP (agent) key instead of the user. */
  mcpKeyId?: string | null;
}): Promise<ObjectiveResult> {
  const updates: Record<string, unknown> = {};

  if (typeof input.name === "string") {
    const name = input.name.trim();
    if (!name) {
      return { ok: false, status: 400, errorKey: "nameRequired" };
    }
    updates.name = name.slice(0, MAX_NAME_LENGTH);
  }
  if ("description" in input) {
    updates.description =
      typeof input.description === "string"
        ? input.description.slice(0, MAX_DESCRIPTION_LENGTH)
        : null;
  }
  if ("status" in input) {
    if (
      typeof input.status !== "string" ||
      !OBJECTIVE_STATUS_VALUES.includes(input.status as never)
    ) {
      return { ok: false, status: 400, errorKey: "invalidStatus" };
    }
    updates.status = input.status;
  }
  if ("lead_user_id" in input) {
    updates.lead_user_id =
      typeof input.lead_user_id === "string" ? input.lead_user_id : null;
  }
  if ("target_date" in input) {
    if (!isDateOrNull(input.target_date)) {
      return { ok: false, status: 400, errorKey: "invalidDate" };
    }
    updates.target_date = input.target_date;
  }
  if ("color" in input) {
    // The color comes from the category palette (hex #rrggbb).
    if (input.color !== null && !isValidColor(input.color)) {
      return { ok: false, status: 400, errorKey: "invalidColor" };
    }
    updates.color = input.color ?? null;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, errorKey: "noFieldsToUpdate" };
  }

  const service = getServiceClient();

  // Snapshot the full row before updating: the access check needs project_id,
  // and the activity diff needs the previous field values.
  const { data: objective } = await service
    .from("objectives")
    .select("*")
    .is("deleted_at", null)
    .eq("id", objectiveId)
    .maybeSingle();
  if (!objective) {
    return { ok: false, status: 404, errorKey: "objectiveNotFound" };
  }
  const access = await getProjectAccess(actorId, objective.project_id as string);
  if (!access) {
    return { ok: false, status: 404, errorKey: "objectiveNotFound" };
  }

  // Same guard as at creation (MIN-339).
  if (typeof updates.lead_user_id === "string") {
    const isMember = await userInProject(
      service,
      updates.lead_user_id,
      objective.project_id as string,
      access.project.owner_id
    );
    if (!isMember) {
      return { ok: false, status: 400, errorKey: "notAProjectMember" };
    }
  }

  // The snapshot and write come back from one database transaction. The RPC
  // locks the project before re-checking membership, so a concurrent revocation
  // is ordered entirely before or after this mutation.
  const { data, error } = await service.rpc("update_objective_guarded", {
    p_objective_id: objectiveId,
    p_actor_id: actorId,
    p_updates: updates,
  });

  if (error) {
    const guard = objectiveGuardError(error.message);
    if (guard === "forbidden" || guard === "notFound") {
      return { ok: false, status: 404, errorKey: "objectiveNotFound" };
    }
    if (guard === "leadForbidden") {
      return { ok: false, status: 400, errorKey: "notAProjectMember" };
    }
    console.error("[objectives] update failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  const mutation = data as {
    previous?: Record<string, unknown>;
    objective?: Record<string, unknown>;
  };
  if (!mutation.previous || !mutation.objective) {
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const previous = mutation.previous;
  const updatedObjective = mutation.objective;

  const events = buildObjectiveFieldChangeEvents(
    objectiveId,
    actorId,
    previous,
    updates
  );
  await insertEvents(
    service,
    stampMcpKey(stampViaAssistant(events, viaAssistant), mcpKeyId)
  );

  // The people who have just been mentioned in the description. The version before
  // serves as a reference: rereading a description does not repeat the old ones.
  if ("description" in updates) {
    await notifyDescriptionMentions(service, {
      projectId: updatedObjective.project_id as string,
      actorId,
      description: updates.description as string | null,
      previousDescription: previous.description as string | null,
      objectiveId,
      mcpKeyId,
      viaAssistant,
    });
    // The cited pages, rewritten in full — cf. `updateIssueFields`.
    queuePageLinks(
      service,
      {
        kind: "objective",
        id: objectiveId,
        projectId: updatedObjective.project_id as string,
      },
      updates.description as string | null
    );
  }

  return { ok: true, objective: updatedObjective };
}

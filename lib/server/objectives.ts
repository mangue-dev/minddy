import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { OBJECTIVE_STATUS_VALUES } from "@/lib/objective-constants";
import { isDateOrNull } from "@/lib/issue-validation";
import { isValidColor } from "@/lib/category-colors";
import { notifyDescriptionMentions } from "@/lib/server/description-mentions";
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
        | "databaseError";
      /** Verbatim DB message already meant for the user. */
      rawMessage?: string;
    };

// Bornes de longueur (MIN-118) : même plafond de nom que les titres de tickets ;
// la description est du markdown libre, bornée comme le plan. Au-delà on tronque.
const MAX_NAME_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 65_536;

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
  /** Attribue l'événement « created » à Numo dans le fil d'activité. */
  viaAssistant?: boolean;
  /** Attribue l'événement à une clé MCP (agent) au lieu de l'utilisateur. */
  mcpKeyId?: string | null;
}): Promise<ObjectiveResult> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    return { ok: false, status: 400, errorKey: "nameRequired" };
  }

  const row: Record<string, unknown> = {
    project_id: projectId,
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
  // La couleur vient de la palette des catégories (hex #rrggbb) — une valeur
  // hors format est ignorée, comme un statut inconnu.
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
  const { data, error } = await service
    .from("objectives")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    console.error("[objectives] create failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

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
      objectiveId: data.id as string,
      commentId: null,
      createdBy: actorId,
      resources: [...parsedResources, ...copied],
    });
  } catch (e) {
    console.error("[objectives] resources failed:", (e as Error).message);
  }

  const created: EventRow[] = [
    { objective_id: data.id as string, actor_id: actorId, type: "created" },
  ];
  await insertEvents(
    service,
    stampMcpKey(stampViaAssistant(created, viaAssistant), mcpKeyId)
  );

  // Les gens cités dans la description de l'objectif qui vient de naître.
  await notifyDescriptionMentions(service, {
    projectId,
    actorId,
    description: data.description as string | null,
    objectiveId: data.id as string,
    mcpKeyId,
  });

  return { ok: true, objective: data };
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
  /** Attribue les événements de changement à Numo dans le fil d'activité. */
  viaAssistant?: boolean;
  /** Attribue les événements à une clé MCP (agent) au lieu de l'utilisateur. */
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
    // La couleur vient de la palette des catégories (hex #rrggbb).
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

  const { data, error } = await service
    .from("objectives")
    .update(updates)
    .is("deleted_at", null)
    .eq("id", objectiveId)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[objectives] update failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data) {
    return { ok: false, status: 404, errorKey: "objectiveNotFound" };
  }

  const events = buildObjectiveFieldChangeEvents(
    objectiveId,
    actorId,
    objective,
    updates
  );
  await insertEvents(
    service,
    stampMcpKey(stampViaAssistant(events, viaAssistant), mcpKeyId)
  );

  // Les gens qui viennent d'être cités dans la description. La version d'avant
  // sert de référence : relire une description ne repingue pas les anciens.
  if ("description" in updates) {
    await notifyDescriptionMentions(service, {
      projectId: objective.project_id as string,
      actorId,
      description: updates.description as string | null,
      previousDescription: objective.description as string | null,
      objectiveId,
      mcpKeyId,
    });
  }

  return { ok: true, objective: data };
}

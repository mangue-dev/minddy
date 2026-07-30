import "server-only";

import { after } from "next/server";
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
  stampForgeSync,
  stampIntegration,
  stampViaAssistant,
  stampMcpKey,
  type EventRow,
} from "@/lib/server/issue-events";
import { insertNotifications } from "@/lib/server/notifications";
import { insertStatEvents, type StatEventRow } from "@/lib/server/stat-events";
import {
  isSmartAssignEligibleStatus,
  scheduleSmartAssign,
} from "@/lib/server/smart-assign";
import { ensureIssueLimit } from "@/lib/server/entitlements";
import { isPlanLimitError } from "@/lib/server/plan-limit-error";
import { captureServerEvent } from "./posthog";

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
        | "attachmentInvalid"
        | "issueLimitReached"
        | "remoteIssueAlreadyImported";
      /** ICU values the message needs (ex. `limit` pour `issueLimitReached`). */
      params?: Record<string, string | number>;
      /** Verbatim DB message already meant for the user (P0001 trigger raise). */
      rawMessage?: string;
    };

/**
 * Identité de l'issue distante qu'un ticket importé reflète (MIN-97) — posée
 * telle quelle sur la ligne, l'index UNIQUE partiel faisant le dédoublonnage.
 */
export interface RemoteIssueRef {
  provider: string;
  repoId: string;
  number: number;
  url: string | null;
}

/**
 * D'où vient ce ticket ? Dérivé des marqueurs de provenance que les appelants
 * posent déjà (`viaAssistant`, `mcpKeyId`, `integrationId`) — aucun nouveau
 * paramètre à câbler dans la douzaine de routes qui créent des tickets.
 */
export function resolveIssueSource(params: {
  viaAssistant?: boolean;
  mcpKeyId?: string | null;
  integrationId?: string | null;
  /** Provider derrière l'écriture quand elle vient de la synchro d'un dépôt lié. */
  forge?: string | null;
  actorId?: string | null;
}): string {
  if (params.forge) return "forge";
  if (params.integrationId) return "integration";
  if (params.viaAssistant) return "numo";
  if (params.mcpKeyId) return "mcp";
  if (!params.actorId) return "system";
  return "web";
}

export async function createIssueForProject({
  projectId,
  projectName = null,
  actorId,
  input,
  viaAssistant = false,
  mcpKeyId = null,
  integrationId = null,
  remote = null,
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
  /** Issue distante que ce ticket reflète (MIN-97) : pose l'identité `remote_*`
      et estampille les événements au nom de la forge. */
  remote?: RemoteIssueRef | null;
}): Promise<CreateIssueResult> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) {
    return { ok: false, status: 400, errorKey: "titleRequired" };
  }

  // Limite issues/projet du plan du owner (MIN-72) — vérifiée ici pour couvrir
  // tous les chemins de création (UI, API v1, MCP, Numo, import CSV, triage).
  try {
    await ensureIssueLimit(projectId);
  } catch (err) {
    if (isPlanLimitError(err)) {
      // `params` porte la limite du plan — le message l'affiche.
      return {
        ok: false,
        status: err.status,
        errorKey: "issueLimitReached",
        params: err.params,
      };
    }
    throw err;
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
  if (remote) {
    row.remote_provider = remote.provider;
    row.remote_repo_id = remote.repoId;
    row.remote_number = remote.number;
    row.remote_url = remote.url;
  }
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
      .is("deleted_at", null)
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
    // 23505 sur l'index d'identité distante = cette issue est DÉJÀ importée.
    // C'est le chemin normal d'une redélivrance de webhook, pas une panne : on
    // le distingue pour que l'appelant l'avale sans bruit (MIN-97).
    if (error.code === "23505" && remote) {
      return { ok: false, status: 409, errorKey: "remoteIssueAlreadyImported" };
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

  // Activité + ledger de stats : best-effort, sans effet sur l'issue renvoyée
  // (le client la voit déjà via l'insert optimiste) et reconciliés par le
  // realtime. Hors du chemin critique du POST via after() — la création répond
  // dès la ligne + catégories écrites. Hors requête HTTP → run synchrone.
  const runSideEffects = async () => {
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
      stampForgeSync(
        stampIntegration(
          stampMcpKey(stampViaAssistant(events, viaAssistant), mcpKeyId),
          integrationId
        ),
        remote?.provider
      )
    );

    // Ledger de stats : une contribution "créée" (et "terminée" si créée
    // directement en done) au nom de l'acteur. Skip pour les issues d'intégration
    // (actorId null) — elles n'appartiennent à aucun utilisateur. Skip aussi pour
    // un ticket importé du dépôt lié : l'acteur technique est le owner qui a lié
    // le dépôt, il n'a rien écrit (même raison que l'import CSV, qui ne touche
    // pas au ledger).
    if (actorId && !remote) {
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

    // Notify a user the issue was born assigned to (never on self-assign) —
    // the update path only covers later re-assignments (MIN-82).
    const bornAssignee = data.assignee_id as string | null;
    if (bornAssignee && bornAssignee !== actorId) {
      await insertNotifications(service, [
        {
          user_id: bornAssignee,
          project_id: projectId,
          type: "assigned",
          issue_id: data.id as string,
          actor_id: actorId,
          // Cf. update-issue : un ticket créé assigné depuis le MCP est l'œuvre
          // de l'agent, la notification doit le nommer comme la timeline.
          via_mcp: !!mcpKeyId,
          api_key_id: mcpKeyId,
        },
      ]);
    }
  };
  const deferSideEffects = () =>
    runSideEffects().catch((e) =>
      console.error("[create-issue] side-effects failed:", (e as Error).message)
    );
  try {
    after(deferSideEffects);
  } catch {
    void deferSideEffects();
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

  // Analytics serveur (MIN-78). C'est le comptage qui FAIT AUTORITÉ : il ne
  // dépend ni du consentement cookies ni d'un navigateur — or une bonne partie
  // des tickets de minddy naissent d'un agent MCP, de Numo ou d'une intégration,
  // là où il n'y a personne devant un écran. `source` est la dimension qui
  // permet de répondre à « qui crée vraiment les tickets ? ».
  captureServerEvent({
    distinctId: actorId ?? `integration:${integrationId ?? "unknown"}`,
    event: "issue_created_server",
    properties: {
      source: resolveIssueSource({
        viaAssistant,
        mcpKeyId,
        integrationId,
        forge: remote?.provider,
        actorId,
      }),
      status: data.status,
      priority: data.priority,
      effort: data.effort ?? "none",
      has_description: !!data.description,
      has_assignee: data.assignee_id != null,
      has_parent: data.parent_id != null,
      category_count: categoryIds.length,
      attachment_count: parsedAttachments.length,
      // Doublon volontaire du groupe : une propriété se découpe gratuitement,
      // l'agrégation par groupe suppose l'add-on payant (voir useAnalytics).
      project_id: projectId,
    },
    groups: { project: projectId },
  });

  return { ok: true, issue: { ...data, category_ids: categoryIds } };
}

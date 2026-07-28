import "server-only";

import { after } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { isEffort, isPriority, isStatus, isDateOrNull } from "@/lib/issue-validation";
import { ISSUE_SELECT, mapIssueRow } from "@/lib/server/issue-mapper";
import {
  buildFieldChangeEvents,
  buildPlanChangeEvents,
  insertEvents,
  stampForgeSync,
  stampViaAssistant,
  stampMcpKey,
  type EventRow,
} from "@/lib/server/issue-events";
import { MAX_PLAN_LENGTH } from "@/lib/plan";
import { insertNotifications } from "@/lib/server/notifications";
import { insertStatEvents, type StatEventRow } from "@/lib/server/stat-events";
import {
  isSmartAssignEligibleStatus,
  scheduleSmartAssign,
} from "@/lib/server/smart-assign";
import { scheduleCycleCapture } from "@/lib/server/cycles";
import { scheduleFeedbackStatusSync } from "@/lib/server/feedback/status-sync";
import { captureServerEvent } from "./posthog";
import { resolveIssueSource } from "./create-issue";
import type { RepoProviderId } from "@/lib/repo-providers";

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
        | "invalidCycle"
        | "planTooLong"
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
  viaAssistant = false,
  mcpKeyId = null,
  forgeSync = null,
}: {
  issueId: string;
  actorId: string;
  input: Record<string, unknown>;
  /** Marks the resulting activity events as triggered through Numo. */
  viaAssistant?: boolean;
  /** Attributes the resulting activity events to an MCP API key (agent actor). */
  mcpKeyId?: string | null;
  /** Attribue les événements à la forge ('github' | 'gitlab') quand l'écriture
      vient de la synchro des issues du dépôt lié (MIN-97) : l'`actorId` reste
      le membre qui porte techniquement l'écriture, la timeline affiche GitHub. */
  forgeSync?: RepoProviderId | null;
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
  if ("plan" in input) {
    const plan = typeof input.plan === "string" ? input.plan : null;
    if (plan && plan.length > MAX_PLAN_LENGTH) {
      return { ok: false, status: 400, errorKey: "planTooLong" };
    }
    updates.plan = plan && plan.trim() ? plan : null;
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
  if ("cycle_id" in input) {
    if (input.cycle_id !== null && typeof input.cycle_id !== "string") {
      return { ok: false, status: 400, errorKey: "invalidCycle" };
    }
    // Existence + the assignment side-effect are resolved below, once the
    // before-snapshot is loaded.
    updates.cycle_id = input.cycle_id ?? null;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, errorKey: "noFieldsToUpdate" };
  }

  const service = getServiceClient();

  // Snapshot before the change: it resolves the project for the access check
  // and is the baseline we diff into activity events. On joint `owner_id` +
  // `deleted_at` pour trancher l'accès ICI, sans le second SELECT projet que
  // faisait getProjectAccess (le projet est déjà chargé par ce join).
  const { data: before } = await service
    .from("issues")
    .select("*, projects(name, owner_id, deleted_at)")
    .eq("id", issueId)
    .maybeSingle();
  if (!before) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }
  const beforeProject = before.projects as
    | { name?: string | null; owner_id?: string; deleted_at?: string | null }
    | null;
  // Accès = projet vivant ET (propriétaire OU membre). Même règle que
  // getProjectAccess/can_access_project ; l'invisibilité RLS devient un 404.
  let hasAccess = !!beforeProject && !beforeProject.deleted_at;
  if (hasAccess && beforeProject!.owner_id !== actorId) {
    const { data: membership } = await service
      .from("project_members")
      .select("project_id")
      .eq("project_id", before.project_id as string)
      .eq("user_id", actorId)
      .maybeSingle();
    hasAccess = !!membership;
  }
  if (!hasAccess) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }

  // Adding to a cycle ASSIGNS the issue to the cycle's owner as a side-effect
  // — never the other way around, and never a status bump (MIN-32). The SQL
  // trigger enforce_issue_cycle then keeps the pair consistent on every path.
  if (typeof updates.cycle_id === "string") {
    const { data: cycle } = await service
      .from("cycles")
      .select("id, user_id")
      .eq("id", updates.cycle_id)
      .maybeSingle();
    if (!cycle) {
      return { ok: false, status: 400, errorKey: "invalidCycle" };
    }
    const finalAssignee =
      "assignee_id" in updates ? updates.assignee_id : before.assignee_id;
    if (!("assignee_id" in input) && finalAssignee !== cycle.user_id) {
      updates.assignee_id = cycle.user_id as string;
    }
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

  // Activité, stats, notifications, touch cycle : best-effort et DÉJÀ
  // réconciliés côté client via le realtime (broadcasts DB). On les sort du
  // chemin critique du PATCH — la réponse part dès la ligne écrite, ces
  // écritures suivent juste après via after(). Hors requête HTTP (assistant en
  // script, cron) : after() lève, on retombe sur un run best-effort synchrone.
  const runSideEffects = async () => {
    const events = buildFieldChangeEvents(issueId, actorId, before, updates);
    if ("plan" in updates && (updates.plan ?? null) !== (before.plan ?? null)) {
      events.push(
        ...buildPlanChangeEvents(
          issueId,
          actorId,
          (before.plan as string) ?? null,
          (updates.plan as string) ?? null
        )
      );
    }
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
    await insertEvents(
      service,
      stampForgeSync(
        stampMcpKey(stampViaAssistant(events as EventRow[], viaAssistant), mcpKeyId),
        forgeSync
      )
    );

    // Cycle membership changed → touch the affected cycle row(s). Issue writes
    // broadcast on the project topic only; the cycles UPDATE rides the owner's
    // user topic so an open /all board refetches live (MIN-32).
    if ("cycle_id" in updates && (updates.cycle_id ?? null) !== (before.cycle_id ?? null)) {
      const touched = [updates.cycle_id, before.cycle_id].filter(
        (id): id is string => typeof id === "string"
      );
      for (const cycleId of new Set(touched)) {
        await service
          .from("cycles")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", cycleId);
      }
    }

    // Ledger de stats : une contribution "terminée" au nom de l'acteur, seulement
    // sur la TRANSITION vers done (before !== done). Cette garde suffit à
    // dédupliquer : canceled/duplicate ne matchent pas, done->done non plus. Un
    // re-passage done->todo->done rajoute volontairement une contribution (compté
    // brut dans la heatmap ; le total, lui, déduplique par issue au read).
    // La synchro d'un dépôt lié (MIN-97) est exclue : l'acteur technique est le
    // owner qui a lié le dépôt, ce n'est pas lui qui a fermé l'issue distante.
    if (updates.status === "done" && before.status !== "done" && !forgeSync) {
      const projectName =
        (before.projects as { name?: string | null } | null)?.name ?? null;
      const statRow: StatEventRow = {
        user_id: actorId,
        kind: "issue_completed",
        occurred_at: (updates.completed_at as string) ?? new Date().toISOString(),
        project_id: (before.project_id as string) ?? null,
        project_name: projectName,
        issue_id: issueId,
        issue_number: (before.number as number) ?? null,
        issue_title: (before.title as string) ?? null,
      };
      await insertStatEvents(service, [statRow]);
    }

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
          // Même attribution que les événements produits juste au-dessus : une
          // affectation venue du MCP est l'agent qui l'a faite, pas le compte
          // dont il porte la clé.
          via_mcp: !!mcpKeyId,
          api_key_id: mcpKeyId,
        },
      ]);
    }
  };
  const deferSideEffects = () =>
    runSideEffects().catch((e) =>
      console.error("[update-issue] side-effects failed:", (e as Error).message)
    );
  try {
    after(deferSideEffects);
  } catch {
    void deferSideEffects();
  }

  // Smart Assign (MIN-31): an unassigned issue leaving triage gets an assignee
  // after the response (opt-in per project; the run re-checks everything).
  const assigneeAfterUpdate =
    "assignee_id" in updates ? updates.assignee_id : before.assignee_id;
  if (
    "status" in updates &&
    before.status === "triage" &&
    isSmartAssignEligibleStatus(updates.status) &&
    assigneeAfterUpdate == null
  ) {
    scheduleSmartAssign({
      issueId,
      projectId: before.project_id as string,
      triggerActorId: actorId,
      trigger: "triage_exit",
    });
  }

  // Cycle auto-capture (MIN-32): an uncycled issue whose assignee has cycles
  // enabled joins their current cycle when it starts or completes (opt-out
  // per-user toggles; the run re-checks everything after the response).
  if ("status" in updates && !("cycle_id" in updates) && before.cycle_id == null) {
    const transition =
      updates.status === "in_progress" && before.status !== "in_progress"
        ? ("started" as const)
        : updates.status === "done" && before.status !== "done"
          ? ("completed" as const)
          : null;
    if (transition && typeof assigneeAfterUpdate === "string") {
      scheduleCycleCapture({
        issueId,
        userId: assigneeAfterUpdate,
        actorId,
        transition,
      });
    }
  }

  // Feedback (MIN-37): le statut public d'un post lié suit l'issue
  // (done→shipped, in_progress→in_progress ; toute autre transition = no-op).
  if ("status" in updates && updates.status !== before.status) {
    scheduleFeedbackStatusSync(issueId, updates.status, actorId);
  }

  // Analytics serveur (MIN-78) : même raison que pour la création — une bonne
  // part des mises à jour vient de MCP, de Numo ou de l'agent de code, hors
  // navigateur. `fields` liste les champs touchés (jamais leurs valeurs texte).
  captureServerEvent({
    distinctId: actorId,
    event: "issue_updated_server",
    properties: {
      source: resolveIssueSource({ viaAssistant, mcpKeyId, forge: forgeSync, actorId }),
      fields: Object.keys(updates).sort().join(","),
      field_count: Object.keys(updates).length,
      ...(typeof updates.status === "string" ? { status: updates.status } : {}),
      ...(typeof updates.priority === "string" ? { priority: updates.priority } : {}),
      project_id: data.project_id as string,
    },
    groups: { project: data.project_id as string },
  });

  return { ok: true, issue: mapIssueRow(data) };
}

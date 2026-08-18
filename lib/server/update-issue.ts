import "server-only";

import { after } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { isEffort, isPriority, isStatus, isDateOrNull } from "@/lib/issue-validation";
import {
  isRecurrenceCadence,
  isRecurrenceOrNull,
  startDueDateISO,
} from "@/lib/recurrence";
import { spawnNextOccurrence } from "@/lib/server/recurrence";
import { ISSUE_SELECT, mapIssueRow } from "@/lib/server/issue-mapper";
import {
  buildFieldChangeEvents,
  buildPlanChangeEvents,
  insertEvents,
  stampForgeSync,
  stampOccurredAt,
  stampViaAssistant,
  stampViaAutomation,
  stampMcpKey,
  type EventRow,
} from "@/lib/server/issue-events";
import { MAX_PLAN_LENGTH } from "@/lib/plan";
import { insertNotifications } from "@/lib/server/notifications";
import { notificationActorSource } from "@/lib/notification-actor";
import { notifyDescriptionMentions } from "@/lib/server/description-mentions";
import { queuePageLinks } from "@/lib/server/page-links";
import { insertStatEvents, type StatEventRow } from "@/lib/server/stat-events";
import {
  applySmartAssign,
  isSmartAssignEligibleStatus,
} from "@/lib/server/smart-assign";
import { scheduleCycleCapture } from "@/lib/server/cycles";
import { statusAllowsCycle } from "@/lib/cycle";
import type { IssueStatus } from "@/lib/issue-constants";
import { scheduleFeedbackStatusSync } from "@/lib/server/feedback/status-sync";
import { scheduleRemoteStatusPush } from "@/lib/server/git/issue-push";
import { scheduleStatusAutomations } from "@/lib/server/automations/hooks";
import { automationSourceOf, parseAutomationOverride } from "@/lib/automations";
import {
  cycleBelongsToUser,
  issueInProject,
  objectiveInProject,
  userInProject,
} from "@/lib/server/tenancy";
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
        | "invalidRecurrence"
        | "recurrenceNeedsDueDate"
        | "invalidPosition"
        | "invalidCycle"
        | "triageCannotJoinCycle"
        | "planTooLong"
        | "noFieldsToUpdate"
        | "issueNotFound"
        | "objectiveNotFound"
        | "duplicateIssueNotFound"
        | "notAProjectMember"
        | "ownerOnly"
        | "databaseError";
      /** Verbatim DB message already meant for the user (P0001 trigger raise). */
      rawMessage?: string;
    };

// Length limits (MIN-118): same title limit as CSV import
// (lib/import/normalize.ts); the description is free markdown, bounded
// like the plan. Beyond that we truncate — no dedicated error key.
const MAX_TITLE_LENGTH = 500;
/** Exported: The truncation below is SILENT, so callers who
 * must refuse loudly (the MCP patch of MIN-186) check first. */
export const MAX_DESCRIPTION_LENGTH = 65_536;

export async function updateIssueFields({
  issueId,
  actorId,
  input,
  viaAssistant = false,
  viaAutomation = false,
  viaAgentRun = false,
  mcpKeyId = null,
  forgeSync = null,
}: {
  issueId: string;
  actorId: string;
  input: Record<string, unknown>;
  /** Marks the resulting activity events as triggered through Numo. */
  viaAssistant?: boolean;
  /** The writing comes from a project AUTOMATION (MIN-147): the timeline
 then names the rule, and not the account whose id technically signs
 the writing (the ticket assignee, or the project owner). Stacks
 with `viaAssistant` — it's Numo who does it, but no one clicked. */
  viaAutomation?: boolean;
  /** The write is a MECHANICAL consequence of the lifecycle of an agent run
 (`issue-status-sync`: start, PR open/merged/denied), and not a
 request. It carries `viaAssistant` like the assistant — hence this flag,
 which separates “Numo relays my request” from “Numo describes where his run is”.
 Only changes the ORIGIN seen by the automations (MIN-147). */
  viaAgentRun?: boolean;
  /** Attributes the resulting activity events to an MCP API key (agent actor). */
  mcpKeyId?: string | null;
  /** Assigns events to the forge ('github' | 'gitlab') when the write
 comes from the synchronization of the outputs of the linked repository (MIN-97): the `actorId` remains
 the member which technically carries the write, the timeline displays GitHub. */
  forgeSync?: RepoProviderId | null;
}): Promise<UpdateIssueResult> {
  const updates: Record<string, unknown> = {};

  if (typeof input.title === "string") {
    const title = input.title.trim();
    if (!title) {
      return { ok: false, status: 400, errorKey: "titleRequired" };
    }
    updates.title = title.slice(0, MAX_TITLE_LENGTH);
  }
  if ("description" in input) {
    updates.description =
      typeof input.description === "string"
        ? input.description.slice(0, MAX_DESCRIPTION_LENGTH)
        : null;
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
  // The four outgoing references (assigned, objective, duplicate, cycle) are not
  // that COLLECTED here: their membership is verified below, once the
  // known ticket project (MIN-339).
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
  if ("recurrence" in input) {
    if (!isRecurrenceOrNull(input.recurrence)) {
      return { ok: false, status: 400, errorKey: "invalidRecurrence" };
    }
    updates.recurrence = input.recurrence;
  }
  if ("position" in input) {
    if (typeof input.position !== "number" || !Number.isFinite(input.position)) {
      return { ok: false, status: 400, errorKey: "invalidPosition" };
    }
    updates.position = input.position;
  }
  // Force automations on THIS ticket (MIN-147). `null` = it follows the
  // project rules; any other form goes through the parser, which returns `null`
  // on what he doesn't understand — an illegible override is worth "no override",
  // jamais un refus d'enregistrement.
  if ("automation_override" in input) {
    updates.automation_override =
      input.automation_override === null
        ? null
        : parseAutomationOverride(input.automation_override);
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
  // `deleted_at` to decide access HERE, without the second SELECT project that
  // did getProjectAccess (the project is already loaded by this join).
  const { data: before } = await service
    .from("issues")
    .select("*, projects(name, owner_id, deleted_at)")
    // A trashed ticket cannot be edited: it is first restored (MIN-133).
    .is("deleted_at", null)
    .eq("id", issueId)
    .maybeSingle();
  if (!before) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }
  const beforeProject = before.projects as
    | { name?: string | null; owner_id?: string; deleted_at?: string | null }
    | null;
  // Access = living project AND (owner OR member). Same rule as
  // getProjectAccess/can_access_project; RLS invisibility becomes a 404.
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

  /**
 * OUTGOING REFERENCES, LIMITED TO THEIR SCOPE (MIN-339).
 *
 * Here and no higher: each resolves against the ticket's project, which we
 * only knows after the snapshot above. All fall into 400 — an out-of-scope reference is an invalid load, not a ticket not found.
 *
 * They are checked on EVERY write, even when the value doesn't change:
 * the only thing that matters is what the line will carry when it returns, and a
 * ticket which was already pointing elsewhere (line inherited from before this check) does not gain the right to continue.
 */
  const projectId = before.project_id as string;
  if (typeof updates.objective_id === "string") {
    // A foreign objective is not just a crooked join: the trigger
    // `SECURITY DEFINER` which recalculates the status of an objective would then leave
    // on that of another tenant.
    if (!(await objectiveInProject(service, updates.objective_id, projectId))) {
      return { ok: false, status: 400, errorKey: "objectiveNotFound" };
    }
  }
  if (typeof updates.duplicate_of_id === "string") {
    if (!(await issueInProject(service, updates.duplicate_of_id, projectId))) {
      return { ok: false, status: 400, errorKey: "duplicateIssueNotFound" };
    }
  }
  if (typeof updates.assignee_id === "string") {
    // Explicit refusal here, where the ticket factory drops in
    // silence: at creation the assignee can come from another project (copy
    // inter-projects), on an edition it is a gesture, and a gesture without effect
    // is told incorrectly in the UI as well as in the timeline.
    const isMember = await userInProject(
      service,
      updates.assignee_id as string,
      projectId,
      beforeProject!.owner_id ?? null
    );
    if (!isMember) {
      return { ok: false, status: 400, errorKey: "notAProjectMember" };
    }
  }
  if (typeof updates.cycle_id === "string") {
    // A cycle is PERSONAL: it has no project, it has an owner, and
    // storing a ticket assigns it to this one (see below). The only cycle
    // that we have the right to fill out is therefore ours.
    if (!(await cycleBelongsToUser(service, updates.cycle_id, actorId))) {
      return { ok: false, status: 400, errorKey: "invalidCycle" };
    }
  }
  if ("automation_override" in updates) {
    //Forcing an automation preset means engaging the quota, plan and
    // the BYOK key of the project OWNER — the resulting runs go
    // on his budget. So it's his alone, and 403: it's not a burden
    // malformed, it’s a right we don’t have.
    if (beforeProject!.owner_id !== actorId) {
      return { ok: false, status: 403, errorKey: "ownerOnly" };
    }
  }

  // Recurrence and deadline go together (MIN-136): a cadence says “and
  // After ? » of a date which must exist — it is she who carries the next
  // occurrence. Setting a pace without a deadline is refused; clear the deadline
  // of a recurring ticket cuts the recurrence (and the activity event
  // said), rather than leaving a series without a starting point.
  const dueDateAfter = ("due_date" in updates ? updates.due_date : before.due_date) as
    | string
    | null;
  const recurrenceAfter = (
    "recurrence" in updates ? updates.recurrence : before.recurrence
  ) as string | null;
  if (recurrenceAfter && !dueDateAfter) {
    if (updates.recurrence) {
      return { ok: false, status: 400, errorKey: "recurrenceNeedsDueDate" };
    }
    updates.recurrence = null;
  }
  // The date we give to a recurrence is a START, not a fixed date:
  // “every week starting last Monday” means next Monday.
  // We therefore postpone it when the schedule is (re)defined — installation or change
  // cadence, choice of a deadline on a recurring ticket — and only there:
  // a late recurring ticket must continue to appear late as long as
  // that it has not been checked, and a title edition does not have to move its date.
  if (
    isRecurrenceCadence(recurrenceAfter) &&
    dueDateAfter &&
    ("recurrence" in updates || "due_date" in updates)
  ) {
    const start = startDueDateISO(dueDateAfter, recurrenceAfter);
    if (start && start !== before.due_date) updates.due_date = start;
  }
  // Cancel (or duplicate) a recurring ticket stops the recurrence: only
  // switching to `done` generates the following occurrence, a series left on
  // a canceled ticket would never produce anything again — just a phantom line
  // in the “Recurrences” page of the project.
  if (
    (updates.status === "canceled" || updates.status === "duplicate") &&
    before.recurrence
  ) {
    updates.recurrence = null;
  }

  // Triage and cycle exclude each other (MIN-32): moving an issue to triage
  // takes it OUT of its cycle, and a triage issue can't be added to one. The
  // SQL trigger enforces it whatever the write path; nulling it HERE too is
  // what makes the activity event and the cycle's realtime nudge below honest.
  const statusAfter = (updates.status ?? before.status) as IssueStatus;
  if (!statusAllowsCycle(statusAfter)) {
    if (typeof updates.cycle_id === "string") {
      return { ok: false, status: 400, errorKey: "triageCannotJoinCycle" };
    }
    if (before.cycle_id) updates.cycle_id = null;
  }

  // Adding to a cycle ASSIGNS the issue to the cycle's owner as a side-effect
  // — never the other way around, and never a status bump (MIN-32). The SQL
  // trigger enforce_issue_cycle then keeps the pair consistent on every path.
  // The owner is the caller: the tenancy custody above does not accept
  // than its own cycle, so there is no longer a third-party account to reread.
  if (typeof updates.cycle_id === "string") {
    const finalAssignee =
      "assignee_id" in updates ? updates.assignee_id : before.assignee_id;
    if (!("assignee_id" in input) && finalAssignee !== actorId) {
      updates.assignee_id = actorId;
    }
  }

  const { data, error } = await service
    .from("issues")
    .update(updates)
    .is("deleted_at", null)
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

  // THE MOMENT OF THE GESTURE, frozen here: the line has just been written. Events
  // go to `after()` (just below) and would otherwise be timestamped to their
  // insert — after Smart Assign, which writes BEFORE the response a few more lines
  // down. The timeline would show "assigned" before "changed status",
  // that is to say the order of writing instead of the order of gestures.
  const occurredAt = new Date().toISOString();

  // Activity, stats, notifications, touch cycle: best-effort and ALREADY
  // reconciled on the client side via realtime (DB broadcasts). We take them out of
  // critical path of the PATCH — the response starts from the written line, these
  // writes follow immediately after via after(). Excluding HTTP request (assistant
  // script, cron): after() raises, we fall back on a synchronous best-effort run.
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
      stampOccurredAt(
        stampForgeSync(
          stampMcpKey(
            stampViaAutomation(
              stampViaAssistant(events as EventRow[], viaAssistant),
              viaAutomation
            ),
            mcpKeyId
          ),
          forgeSync
        ),
        occurredAt
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

    // Stats ledger: a “finished” contribution in the name of the actor, only
    // on the TRANSITION to done (before !== done). This guard is enough to
    // deduplicate: canceled/duplicate do not match, done->done neither. A
    // re-pass done->todo->done voluntarily adds a contribution (counted
    // raw in the heatmap; the total, for its part, deduplicates by issue in the read).
    // The synchronization of a linked repository (MIN-97) is excluded: the technical actor is the
    // owner who linked the repository, it was not him who closed the remote issue.
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

    // Recurring ticket completed (MIN-136): the next occurrence is born here, in
    // backlog, at the deadline shifted by one cadence. After the response like
    // other effects — realtime makes it appear on open tables.
    if (updates.status === "done" && before.status !== "done" && before.recurrence) {
      await spawnNextOccurrence({
        service,
        completed: before,
        actorId,
        projectName: (before.projects as { name?: string | null } | null)?.name ?? null,
      });
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
          // Same attribution as the events produced just above: a
          // assignment coming from an agent is the agent who made it, not the
          // account for which he carries the key — the MCP by name, Numo otherwise.
          ...notificationActorSource({ viaAssistant, mcpKeyId }),
        },
      ]);
    }

    // The people who have just been mentioned in the description. `before` serves as
    // reference: re-reading a description does not repeat those who were already there.
    if ("description" in updates) {
      await notifyDescriptionMentions(service, {
        projectId: before.project_id as string,
        actorId,
        description: updates.description as string | null,
        previousDescription: before.description as string | null,
        issueId,
        mcpKeyId,
        viaAssistant,
      });
      // And the PAGES she cites (MIN-279). No difference here, unlike
      // mentions of people: the links do not warn anyone, they describe
      // a state — we therefore rewrite what the description says NOW, which
      // is also the only way to make a removed quote disappear.
      queuePageLinks(
        service,
        {
          kind: "issue",
          id: issueId,
          projectId: before.project_id as string,
        },
        updates.description as string | null
      );
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
  // (opt-in per project; the run re-checks everything). WHEREAS, as in
  // creation: the deterministic case written before the response, only the call to
  // model restarts as `after()` (see the header of lib/server/smart-assign.ts).
  const assigneeAfterUpdate =
    "assignee_id" in updates ? updates.assignee_id : before.assignee_id;
  let smartAssignee: string | null = null;
  if (
    "status" in updates &&
    before.status === "triage" &&
    isSmartAssignEligibleStatus(updates.status) &&
    assigneeAfterUpdate == null
  ) {
    smartAssignee = await applySmartAssign({
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

  // Feedback (MIN-37): the public status of a linked post follows the outcome, EACH
  // transition — the correspondence table is complete, there are no more
  // transition qui ne dise rien (cf. status-sync).
  if ("status" in updates && updates.status !== before.status) {
    scheduleFeedbackStatusSync(issueId, updates.status, actorId);

    // Linked deposit: the ticket closes (or reopens) the issue from which it comes. The guard
    // `!forgeSync` IS the anti-loop — a status that GOES DOWN from the webhook of the
    // forge should not go back there immediately. No-op for a ticket born in
    // minddy: `scheduleRemoteStatusPush` spell on the absence of identity
    // remote, without request.
    if (!forgeSync) {
      scheduleRemoteStatusPush({
        issue: {
          projectId: before.project_id as string,
          provider: (before.remote_provider as string | null) ?? null,
          repoId: (before.remote_repo_id as string | null) ?? null,
          number: (before.remote_number as number | null) ?? null,
        },
        status: updates.status as IssueStatus,
        actorId,
      });
    }
    // Automations (MIN-147): the status change is one of the two
    // only events that the loop needs. Same contract as its neighbors —
    // off critical path, and silent no-op if the world has moved.
    scheduleStatusAutomations({
      issueId,
      projectId: before.project_id as string,
      from: (before.status as IssueStatus | null) ?? null,
      to: updates.status as IssueStatus,
      // THE ORIGIN decides whether a rule has the right to react: the presets which
      // write code only accept a human gesture, those who check
      // also accept an agent. Same resolver as the analytical source — one
      // second taxonomy would diverge the day one of the two moves.
      source: automationSourceOf({
        raw: resolveIssueSource({ viaAssistant, mcpKeyId, forge: forgeSync, actorId }),
        viaAutomation,
        viaAgentRun,
      }),
    });
  }

  // Server Analytics (MIN-78): same reason as for creation — a good one
  // part of the updates comes from MCP, Numo or the code agent, excluding
  // browser. `fields` lists the affected fields (never their text values).
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

  // Same reason as at creation: `data` was read before Smart Assign
  // do not write, only the returned ticket carries the correction.
  return {
    ok: true,
    issue: mapIssueRow(
      smartAssignee ? { ...data, assignee_id: smartAssignee } : data
    ),
  };
}

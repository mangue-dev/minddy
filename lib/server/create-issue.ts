import "server-only";

import { after } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { isEffort, isPriority, isStatus, isDateOrNull } from "@/lib/issue-validation";
import { isRecurrenceCadence, startDueDateISO } from "@/lib/recurrence";
import { MAX_PLAN_LENGTH } from "@/lib/plan";
import {
  copyResourcesToProject,
  insertAttachments,
  parseResourcesInput,
} from "@/lib/server/attachments";
import {
  insertEvents,
  stampForgeSync,
  stampIntegration,
  stampViaAssistant,
  stampMcpKey,
  type EventRow,
} from "@/lib/server/issue-events";
import { ISSUE_SELECT, mapIssueRow } from "@/lib/server/issue-mapper";
import { runSmartFill } from "@/lib/server/smart-fill";
import { insertNotifications } from "@/lib/server/notifications";
import { notificationActorSource } from "@/lib/notification-actor";
import { notifyDescriptionMentions } from "@/lib/server/description-mentions";
import { queuePageLinks } from "@/lib/server/page-links";
import { insertStatEvents, type StatEventRow } from "@/lib/server/stat-events";
import {
  applySmartAssign,
  isSmartAssignEligibleStatus,
} from "@/lib/server/smart-assign";
import { ensureIssueLimit } from "@/lib/server/entitlements";
import { isPlanLimitError } from "@/lib/server/plan-limit-error";
import { objectiveInProject } from "@/lib/server/tenancy";
import { captureServerEvent } from "./posthog";

/**
 * Shared issue-creation core: builds the row from an untrusted input payload,
 * assigns the KEY-number atomically, inserts via the customer service, attaches
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
        | "objectiveNotFound"
        | "nestingLimitedToOneLevel"
        | "planTooLong"
        | "invalidRecurrence"
        | "recurrenceNeedsDueDate"
        | "databaseError"
        | "resourceInvalid"
        | "issueLimitReached"
        | "remoteIssueAlreadyImported";
      /** ICU values ​​the message needs (e.g. `limit` for `issueLimitReached`). */
      params?: Record<string, string | number>;
      /** Verbatim DB message already meant for the user (P0001 trigger raise). */
      rawMessage?: string;
    };

/**
 * Identity of the remote issue that an imported ticket reflects (MIN-97) — set
 * as is on the line, the partial UNIQUE index doing the deduplication.
 */
export interface RemoteIssueRef {
  provider: string;
  repoId: string;
  number: number;
  url: string | null;
}

/**
 * Where does this ticket come from? Derived from provenance markers that callers
 * already asked (`viaAssistant`, `mcpKeyId`, `integrationId`) — no new ones
 * parameter to wire into the dozen routes that create tickets.
 */
export function resolveIssueSource(params: {
  viaAssistant?: boolean;
  mcpKeyId?: string | null;
  integrationId?: string | null;
  /** Provider behind the writing when it comes from the synchronization of a linked repository. */
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

// Length terminals (MIN-118). The heart truncates in silence — same philosophy
// than silently dropping invalid enums — so as not to break any callers
// (UI, MCP, Numo, CSV import); only the plan keeps its explicit rejection.
const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 65_536;
const MAX_CATEGORY_REFS = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createIssueForProject({
  projectId,
  projectName = null,
  actorId,
  input,
  viaAssistant = false,
  mcpKeyId = null,
  integrationId = null,
  remote = null,
  recurrenceSeriesId = null,
  rowId = null,
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
  /** Remote issue that this ticket reflects (MIN-97): sets the identity `remote_*`
      and stamps events in the name of the forge. */
  remote?: RemoteIssueRef | null;
  /** Recurrence series to which to attach the ticket (MIN-136) — posed by
      lib/server/recurrence.ts on the occurrence it creates, never by a
      client payload. Null = this ticket opens its own series (see seriesIdOf). */
  recurrenceSeriesId?: string | null;
  /** ID that the customer has ALREADY given to his optimistic card: the line is born with,
      so that the real-time broadcast of this creation is recognized as the
      its own rather than adopted in duplicate (lib/optimistic-issue.ts). Asked by the
      only web route, NEVER read in `input` — the other ten callers (MCP,
      Numo, forge webhooks, import, recurrence, promotion of a return)
      transmit charges that they did not write, and a misplaced `id` is not there
      would not designate the line to be created. Ignored if it is not a UUID, such as
      enums invalides. */
  rowId?: string | null;
}): Promise<CreateIssueResult> {
  const title =
    typeof input.title === "string" ? input.title.trim().slice(0, MAX_TITLE_LENGTH) : "";
  if (!title) {
    return { ok: false, status: 400, errorKey: "titleRequired" };
  }

  // Owner Plan Issues/Draft Limit (MIN-72) — checked here to cover
  // all creation paths (UI, API v1, MCP, Numo, CSV import, triage).
  try {
    await ensureIssueLimit(projectId);
  } catch (err) {
    if (isPlanLimitError(err)) {
      // `params` carries the plan limit — the message displays it.
      return {
        ok: false,
        status: err.status,
        errorKey: "issueLimitReached",
        params: err.params,
      };
    }
    throw err;
  }

  // Resources for the new issue: files the client already uploaded under this
  // project's storage prefix, and links /link-preview already resolved.
  const parsedResources = parseResourcesInput(
    input.resources,
    `projects/${projectId}/`
  );
  if (parsedResources === null) {
    return { ok: false, status: 400, errorKey: "resourceInvalid" };
  }

  // Cross-project creation: files uploaded under another project's prefix, to be
  // COPIED into this one. Validated with the generic `projects/` family here;
  // per-file source access is checked at copy time (copyResourcesToProject).
  const parsedCopyResources = parseResourcesInput(
    input.copy_resources,
    "projects/"
  );
  if (parsedCopyResources === null) {
    return { ok: false, status: 400, errorKey: "resourceInvalid" };
  }

  const clientRowId = typeof rowId === "string" && UUID_RE.test(rowId) ? rowId : null;

  const row: Record<string, unknown> = {
    project_id: projectId,
    title,
    created_by: actorId,
    position: Date.now(),
  };
  if (clientRowId) row.id = clientRowId;
  if (integrationId) row.integration_id = integrationId;
  if (remote) {
    row.remote_provider = remote.provider;
    row.remote_repo_id = remote.repoId;
    row.remote_number = remote.number;
    row.remote_url = remote.url;
  }
  if (typeof input.description === "string") {
    row.description = input.description.slice(0, MAX_DESCRIPTION_LENGTH);
  }
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

  // Recurrence (MIN-136): a cadence requires a deadline, which then carries the
  // FIRST occurrence. Same rule as updating — one recurring ticket
  // without a date there would be nothing to delay its closing.
  if ("recurrence" in input && input.recurrence !== null) {
    if (!isRecurrenceCadence(input.recurrence)) {
      return { ok: false, status: 400, errorKey: "invalidRecurrence" };
    }
    if (!row.due_date) {
      return { ok: false, status: 400, errorKey: "recurrenceNeedsDueDate" };
    }
    row.recurrence = input.recurrence;
    // The date of a recurrence is a START: if it has already passed, the
    // ticket is born on the first upcoming occurrence rather than late.
    row.due_date =
      startDueDateISO(row.due_date as string, input.recurrence) ?? row.due_date;
    if (recurrenceSeriesId) row.recurrence_series_id = recurrenceSeriesId;
  }

  const service = getServiceClient();

  // An assignee must belong to the target project. Cross-project creation may
  // carry an assignee_id whose user isn't a member here — drop it rather than
  // assign a stranger. (Same-project assignees are picked from the project's
  // own member list, so this is a no-op there.)
  if (typeof row.assignee_id === "string") {
    const assigneeAccess = await getProjectAccess(row.assignee_id, projectId);
    if (!assigneeAccess) row.assignee_id = null;
  }

  // Same requirement for the OBJECTIVE (MIN-339): it must live in this project.
  // Explicit refusal, unlike the assignee just above — an assignee
  // stranger legitimately arrives from a cross-project copy and drops himself,
  // where a foreign objective has no use case AND triggers the trigger
  // `SECURITY DEFINER` for recalculation of status on the objective of another tenant.
  if (typeof row.objective_id === "string") {
    if (!(await objectiveInProject(service, row.objective_id, projectId))) {
      return { ok: false, status: 400, errorKey: "objectiveNotFound" };
    }
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

  /**
   * SMART-FILL (MIN-260) — just BEFORE the line exists, and that's all
   * drawing of the feature: the ticket is born complete, so there is never any
   * half-filled ticket to hide in the board.
   *
   * Here and not above: all validations have passed (parent, member,
   * recurrence), so we do not pay for a model call for a creation that
   * will be refused. And not lower: after the insert, you would need an UPDATE and
   * a second real-time broadcast, that is to say exactly the empty card
   * qu'on ne veut pas montrer.
   *
   * HE ONLY COMPLETES WHAT HUMAN LEFT EMPTY. A field laid by hand
   * always wins — including the goal inherited from a fair parent ticket
   * above. It is an input aid, not a corrector.
   */
  let smartFillCategoryIds: string[] = [];
  // The fields that Smart-fill ACTUALLY asked — not the ones it suggested.
  // It is this list that goes into the activity: say “met the priority”
  // of a ticket whose author had already put “urgent” would be a lie, and
  // it's precisely the kind of line that makes you stop believing in the timeline.
  const smartFilled: string[] = [];
  if (input.smart_fill === true) {
    const patch = await runSmartFill({
      projectId,
      projectName: projectName ?? "this project",
      actorId,
      title: row.title as string,
      description: (row.description as string | null) ?? null,
    });
    // “none” is the default of the form, not a choice: a ticket that arrives
    // without priority did not refuse one.
    if (patch.priority && (row.priority == null || row.priority === "none")) {
      row.priority = patch.priority;
      smartFilled.push("priority");
    }
    // `effort: null` is a REAL answer (“nothing valuable”) — but it
    // changes nothing to an already null field, and announcing it would be an invisible gesture.
    if (patch.effort != null && row.effort == null) {
      row.effort = patch.effort;
      smartFilled.push("effort");
    }
    if (patch.objective_id && row.objective_id == null) {
      row.objective_id = patch.objective_id;
      smartFilled.push("objective_id");
    }
    if (patch.category_ids?.length) smartFillCategoryIds = patch.category_ids;
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
    // 23505 on remote identity index = this issue is ALREADY imported.
    // This is the normal path for a webhook reissue, not a failure: we
    // distinguishes it so that the appellant swallows it quietly (MIN-97).
    if (error.code === "23505" && remote) {
      return { ok: false, status: 409, errorKey: "remoteIssueAlreadyImported" };
    }
    // 23505 on the PRIMARY KEY even though it was the customer who chose it: the
    // same creation replayed (double submission, return after a response
    // lost). The ticket from before IS the expected result — make it as is
    // rather than a second ticket or an error. The side effects have
    // already occurred on the first pass.
    if (error.code === "23505" && clientRowId) {
      const { data: existing } = await service
        .from("issues")
        .select(ISSUE_SELECT)
        .eq("id", clientRowId)
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .maybeSingle();
      if (existing) return { ok: true, issue: mapIssueRow(existing) };
    }
    console.error("[create-issue] create failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  // Resource rows — the issue exists from here on, so a failure must not
  // fail the request (the resources just don't get registered). Cross-project files
  // are copied into this project's storage prefix first, then registered
  // alongside the local ones.
  try {
    const copied = await copyResourcesToProject(service, {
      targetProjectId: projectId,
      actorId,
      resources: parsedCopyResources,
    });
    await insertAttachments(service, {
      projectId,
      issueId: data.id as string,
      commentId: null,
      createdBy: actorId,
      resources: [...parsedResources, ...copied],
    });
  } catch (e) {
    console.error("[create-issue] resources failed:", (e as Error).message);
  }

  // Attach categories that belong to this project — matched by ID (same-project
  // creation) and/or by NAME (cross-project creation carries names, since a
  // category ID is scoped to one project). The DB filter on project_id keeps
  // foreign values out either way.
  let categoryIds: string[] = [];
  const pickedIds = Array.isArray(input.category_ids)
    ? input.category_ids
        .filter((v): v is string => typeof v === "string")
        .slice(0, MAX_CATEGORY_REFS)
    : [];
  const requestedNames = Array.isArray(input.category_names)
    ? input.category_names
        .filter((v): v is string => typeof v === "string")
        .slice(0, MAX_CATEGORY_REFS)
    : [];
  // Smart-fill only stores the ticket if NOBODY has stored it — neither by id nor
  // by name. Hand-picked categories are a choice, and adding the
  // would undo half.
  const requestedIds =
    pickedIds.length === 0 && requestedNames.length === 0 ? smartFillCategoryIds : pickedIds;
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

  /**
   * BIRTH OF THE TICKET IN HIS JOURNAL — written HERE, before the response, and
   * this is the point of the module that should not be moved back to `after()`.
   *
   * These three lines lived there, with the rest of the side effects, and that didn't
   * did not hold up — for the two reasons that the timeline told wrong:
   *
   * 1. ORDER. Everything after creation written BEFORE the answer: Smart
   * Assign (deterministic case, lower), and the relations that the
   * callers ask when returning from this function. “created the ticket”
   * therefore arrived AFTER “assigned” or “linked” — on 286 tickets
   * prod, 44 recounted their birth in third position.
   * 2. LOSS. The work according to the answer is best-effort: when
   * the insert falls (network cut to summon jelly), it is
   * logged and forgotten, and the ticket no longer has ANY activity — no
   * even its creation. MIN-265 was born like this.
   *
   * An insertion, on a path which has just made three: waiting for it costs
   * cheaper than losing it. Same reasoning, word for word, as the
   * cutting of Smart Assign (see the header of lib/server/smart-assign.ts).
   *
   * The webhooks remain deferred: `insertEvents` dispatches them to its
   * propre `after()`.
   */
  const birthEvents: EventRow[] = [
    { issue_id: data.id, actor_id: actorId, type: "created" },
  ];
  if (data.parent_id) {
    birthEvents.push({
      issue_id: data.parent_id,
      actor_id: actorId,
      type: "sub_issue_added",
      to_value: data.id,
    });
  }
  /**
   * SMART-FILL IN ACTIVITY (MIN-260) — a single event, after “created
   * the ticket", and attributed to Smart-fill rather than the author: these
   * he did not pose these properties.
   *
   * `actor_id` remains that of the author, as for Smart Assign: that's good
   * under his account that the writing took place, and the flag is enough for the
   * timeline names the automation. `to_value` carries the list of fields, and
   * the sentence is composed on display — in the reader's language.
   *
   * Nothing filled, nothing to say: a “Smart-fill found nothing” event
   * doesn't learn anything and would repeat itself on all tickets in a line.
   */
  if (smartFilled.length > 0 || smartFillCategoryIds.length > 0) {
    const filled = [...smartFilled];
    if (smartFillCategoryIds.length > 0) filled.push("category_ids");
    birthEvents.push({
      issue_id: data.id,
      actor_id: actorId,
      type: "updated",
      field: "smart_fill",
      to_value: filled.join(","),
      via_smart_fill: true,
    });
  }
  await insertEvents(
    service,
    stampForgeSync(
      stampIntegration(
        stampMcpKey(stampViaAssistant(birthEvents, viaAssistant), mcpKeyId),
        integrationId
      ),
      remote?.provider
    )
  );

  // Stats ledger + notifications: best-effort, with no effect on the outcome
  // returned (the client already sees it via the optimistic insert) and reconciled by
  // realtime. Out of the POST critical path via after(). Excluding HTTP request
  // → run synchrone.
  const runSideEffects = async () => {
    // Stats ledger: a contribution “created” (and “completed” if created)
    // directly in done) in the name of the actor. Skip for integration issues
    // (actorId null) — they do not belong to any user. Skip also for
    // a ticket imported from the linked repository: the technical actor is the owner who linked
    // the deposit, he did not write anything (same reason as the CSV import, which does not affect
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
          // See update-issue: a ticket created assigned by an agent is the work
          // of the agent, the notification should name it like the timeline.
          ...notificationActorSource({ viaAssistant, mcpKeyId }),
        },
      ]);
    }

    // The people mentioned in the description of the ticket which has just been born. No
    // previous version: everything in it is new.
    await notifyDescriptionMentions(service, {
      projectId,
      actorId,
      description: data.description as string | null,
      issueId: data.id as string,
      mcpKeyId,
      viaAssistant,
    });

    // The PAGES cited by this description (MIN-279): the ticket which is born in
    // relying on a spec must appear in the "Cited by" of this
    // spec, without waiting for its first modification.
    queuePageLinks(
      service,
      { kind: "issue", id: data.id as string, projectId },
      data.description as string | null
    );
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
  // one (opt-in per project; the run re-checks everything). Integration issues
  // are forced to "triage" by their routes, so never match.
  //
  // EXPECTED, unlike the side effects above: the deterministic case
  // written here, before the answer. Delayed, he got lost — that's all
  // topic of MIN-31 revisited (see header of lib/server/smart-assign.ts).
  // Only the call to the model restarts in `after()`, from the run.
  let smartAssignee: string | null = null;
  if (data.assignee_id == null && isSmartAssignEligibleStatus(data.status)) {
    smartAssignee = await applySmartAssign({
      issueId: data.id as string,
      projectId,
      triggerActorId: actorId,
      trigger: "create",
    });
  }

  // Server Analytics (MIN-78). It is the counting that GIVES AUTHORITY: it does not
  // depends neither on cookie consent nor on a browser — but a good part
  // minddy tickets arise from an MCP agent, Numo or an integration,
  // where there is no one in front of a screen. `source` is the dimension that
  // allows you to answer “who really creates the tickets?” ".
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
      resource_count: parsedResources.length,
      // Voluntary duplicate of the group: a property is cut free of charge,
      // aggregation by group assumes the paid add-on (see useAnalytics).
      project_id: projectId,
    },
    groups: { project: projectId },
  });

  // `data` remains the line AS IT WAS BORN — delayed side effects
  // rely on it (the “created assigned” notification should not be triggered
  // on the choice of Smart Assign, which already sends its own) and analytics
  // above counts tickets created WITH an assignee. Only the ticket returned
  // carries the correction: the MCP agent reads this response to know to whom he has
  // business, and the live broadcast only catches what it sees happening.
  return {
    ok: true,
    issue: {
      ...data,
      ...(smartAssignee ? { assignee_id: smartAssignee } : {}),
      category_ids: categoryIds,
    },
  };
}

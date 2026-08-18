import "server-only";

import { afterOrNow } from "@/lib/server/after-safe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValues } from "@/lib/server/app-config";
import { modelConfigKeys, resolveFromValues } from "@/lib/server/model-config";
import { canUseSmartAssign } from "@/lib/server/entitlements";
import { insertEvents } from "@/lib/server/issue-events";
import { insertNotifications } from "@/lib/server/notifications";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
import { forcedToolCall } from "@/lib/server/feedback/forced-tool-call";
import { isStatus } from "@/lib/issue-validation";
import { hasAnyRule, userIdsWithoutRule } from "@/lib/smart-assign-config";
import type { SmartAssignConfigWarning } from "@/lib/types";

/**
 * Smart Assign (MIN-31) — guarantees no active issue stays unassigned on
 * projects that opted in. Triggered after an issue is created past triage
 * without an assigned, or when an unassigned issue leaves triage.
 *
 * - Single-member project (owner only): deterministic, no AI.
 * - Multi-member with no rule written for anyone: deterministic too, the owner —
 * with no rule the model has nothing but names to compare.
 * - Multi-member with rules: one forced tool call to the model in app_config
 * (`smart_assign_model`), fed the issue and the per-member rules; any
 * failure falls back to the owner so the run always assigns someone.
 *
 * The written event carries `smart_assign_ai`: only the third case sets it to
 * true, and only if the model responded a valid member. This is what
 * the ticket activity distinguishes — otherwise the three would read the same.
 *
 * The run re-checks EVERYTHING at the moment it executes: an expired trigger
 * (toggle dropped, someone assigned in the meantime, status returned to triage)
 * is a silent no-op.
 *
 * ## What is done right away, and what is deferred
 *
 * Everything lived in `after()`. It doesn't hold: the work according to the response
 * is best effort at best, and a ticket created by the MCP paid the price —
 * the event `created` writes, the assignment never. The culprit was not the
 * decision (it takes a second) but its length: six round trips of
 * READ before any writing, including three for a budget check on
 * a path that spends nothing. Six opportunities to disappear without a trace.
 *
 * Hence the cut:
 * - the DETERMINIST case (single member, or no rule) written before the response.
 * This is an update; waiting for it costs less than losing it;
 * - only the call to the MODEL remains deferred — several seconds of latency have nothing to do in a POST — and it is HIM alone that the budget keeps;
 * - `sweepUnassignedIssues` (cron) catches up with what the latter `after()` loses.
 */

const MAX_DESCRIPTION_CHARS = 4000;

/** Catch-up window: beyond that, an unassigned ticket is a choice, not
 an accident (see sweepUnassignedIssues). */
const SWEEP_WINDOW_MS = 24 * 60 * 60_000;
/** Enough to absorb a burst of sub-tickets, few enough to fit in the cron window — the rest is picked up the next time you wake up. */
const SWEEP_LIMIT = 100;

/** Statuses Smart Assign acts on: anything past triage that is still a real,
    living issue. */
export function isSmartAssignEligibleStatus(status: unknown): boolean {
  return (
    isStatus(status) &&
    status !== "triage" &&
    status !== "canceled" &&
    status !== "duplicate"
  );
}

export interface SmartAssignParams {
  issueId: string;
  projectId: string;
  /** Who created / transitioned the issue — suppresses their own notification
      when Smart Assign picks them. NULL for integration-created issues. */
  triggerActorId: string | null;
  /** `sweep` = cron catch-up. He has no response to give, so he
 WAITS for the call to the model instead of deferring it — deferring is precisely what caused the assignment he is repairing to be lost. */
  trigger: "create" | "triage_exit" | "sweep";
}

/**
 * Entry point of the two writing cores (creation / update of a
 * ticket): to WAIT, and without a net to place — it never raises.
 *
 * What we wait for is the decision and, in the deterministic case, writing.
 * Not the call to the model: this one goes to `after()` from `runSmartAssign`.
 *
 * Returns the written assignment, so the caller can return an up-to-date ticket
 * rather than a line it already knows expired.
 */
export async function applySmartAssign(
  params: SmartAssignParams
): Promise<string | null> {
  try {
    return await runSmartAssign(params);
  } catch (err) {
    console.error("[smart-assign] run failed:", (err as Error).message);
    return null;
  }
}

/**
 * The run itself. Returns the assignee that THIS run wrote — so `null` if there
 * had nothing to do, but also when the call to the model was deferred: at that
 * moment nothing is written yet, and to pretend otherwise would lie to
 * the caller as well as to the sweeper who account.
 */
export async function runSmartAssign(
  params: SmartAssignParams
): Promise<string | null> {
  const service = getServiceClient();

  // The three readings IN PARALLEL: they do not depend on each other
  // others, and it is the length of this prelude which decides whether the assignment
  // survit. Un aller-retour de temps d'horloge, pas trois.
  const [{ data: project }, { data: issue }, { data: memberRows }] =
    await Promise.all([
      service
        .from("projects")
        .select("id, name, owner_id, smart_assign_enabled, smart_assign_rules")
        .eq("id", params.projectId)
        .is("deleted_at", null)
        .maybeSingle(),
      service
        .from("issues")
        .select("id, title, description, status, priority, effort, assignee_id")
        .is("deleted_at", null)
        .eq("id", params.issueId)
        .maybeSingle(),
      service
        .from("project_members")
        .select("user_id")
        .eq("project_id", params.projectId),
    ]);

  // Re-check everything at execution time — the world may have moved since
  // the schedule (toggle off, project deleted, issue assigned or re-triaged).
  if (!project?.smart_assign_enabled) return null;
  if (!issue || issue.assignee_id !== null) return null;
  if (!isSmartAssignEligibleStatus(issue.status)) return null;

  // The team = owner (no project_members row) + members.
  const ownerId = project.owner_id as string;
  const memberIds = [
    ownerId,
    ...(memberRows ?? [])
      .map((m) => m.user_id as string)
      .filter((id) => id !== ownerId),
  ];

  const rules = (project.smart_assign_rules ?? {}) as Record<string, string>;
  // A rule written for SOMEONE on the team is what makes the choice
  // possible: without any, the model only has names to compare, and the prompt
  // already tells him to fall back on the owner in this case. Might as well not pay
  // the call — the result is the same, cheaper and without latency.
  if (memberIds.length === 1 || !hasAnyRule(memberIds, rules)) {
    // Only member, or no rules: no ambiguity to remove, no AI — therefore
    // nothing to charge, nothing to keep, and no reason to wait for a response
    // to write. This is the case for the vast majority of projects.
    return await claimForSmartAssign(service, params, ownerId, false);
  }

  // Remains the only piece that costs: a few seconds of latency and a line
  // of use. He leaves after the answer — except for the sweeper, who doesn't have one.
  const askTheModel = async () => {
    // The budget ONLY keeps the expense. Putting him at the head of the run amounted to
    // also suspend deterministic assignments, which cost nothing; And
    // dry budget or silent model, the contract remains the same — we assign
    // someone, failing that the owner.
    const picked = (await canUseSmartAssign(ownerId))
      ? await chooseAssigneeViaAI({
          service,
          projectId: params.projectId,
          projectName: (project.name as string) ?? "",
          issue,
          memberIds,
          ownerId,
          rules,
        })
      : null;
    // Did the model REALLY choose? The ticket activity says so, and the
    // two modes are not equal: falling back on the owner — fault
    // call, or exploitable response error — remains an assignment
    // automatique.
    return await claimForSmartAssign(
      service,
      params,
      picked ?? ownerId,
      picked !== null
    );
  };
  if (params.trigger === "sweep") return await askTheModel();
  afterOrNow(async () => {
    await askTheModel();
  });
  return null;
}

/**
 * Writing: compare-and-set against a concurrent manual assignment
 * (no rows returned → someone beat us to it), then the activity and the
 * notification.
 *
 * The three go together and in this order: an assignment without its
 * event would be an invisible hand in the timeline — worse than no assignment at all.
 */
async function claimForSmartAssign(
  service: SupabaseClient,
  params: SmartAssignParams,
  chosen: string,
  chosenByModel: boolean
): Promise<string | null> {
  const { data: claimed } = await service
    .from("issues")
    .update({ assignee_id: chosen })
    .is("deleted_at", null)
    .eq("id", params.issueId)
    .is("assignee_id", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return null;

  await insertEvents(service, [
    {
      issue_id: params.issueId,
      actor_id: null,
      type: "updated",
      field: "assignee_id",
      from_value: null,
      to_value: chosen,
      via_smart_assign: true,
      smart_assign_ai: chosenByModel,
    },
  ]);

  if (chosen !== params.triggerActorId) {
    await insertNotifications(service, [
      {
        user_id: chosen,
        project_id: params.projectId,
        type: "assigned",
        issue_id: params.issueId,
        actor_id: null,
        // Without this flag the inbox reads a null actor and displays “Someone” —
        // the timeline already names Smart Assign on the same gesture.
        via_smart_assign: true,
      },
    ]);
  }
  return chosen;
}

/**
 * CATCH-UP (cron `/api/cron/smart-assign`): tickets that a
 * trigger should have assigned and which remained without anyone.
 *
 * It exists because there is no guarantee that a `after()` will complete — this is
 * exactly how a ticket created by the MCP remained orphaned, without
 * error, without trace, without retrying. The deterministic case no longer depends on it
 *; the call to the model, if.
 *
 * Two bounds, which say what this scan is and is not:
 *
 * - **24 h**, on creation OR last modification. This is a net under
 * a recent trigger, not a reread of the backlog: activate the toggle
 * must not assign three years of backlog at once.
 * - **Never assigned**, in the sense of the activity: a ticket which carries a
 * event `assignee_id` has left the perimeter, whoever the author.
 * Without this, emptying the assignee of a ticket by hand would see him return on his own
 * within the hour — a “net” which contradicts an explicit gesture is not one.
 */
export async function sweepUnassignedIssues(
  limit = SWEEP_LIMIT
): Promise<{ candidates: number; assigned: number }> {
  const service = getServiceClient();
  const since = new Date(Date.now() - SWEEP_WINDOW_MS).toISOString();

  const { data: rows, error } = await service
    .from("issues")
    .select("id, project_id, projects!inner(smart_assign_enabled, deleted_at)")
    .is("deleted_at", null)
    .is("assignee_id", null)
    .not("status", "in", "(triage,canceled,duplicate)")
    .eq("projects.smart_assign_enabled", true)
    .is("projects.deleted_at", null)
    .or(`created_at.gte.${since},updated_at.gte.${since}`)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const candidates = (rows ?? []) as Array<{ id: string; project_id: string }>;
  if (candidates.length === 0) return { candidates: 0, assigned: 0 };

  const { data: touched } = await service
    .from("issue_events")
    .select("issue_id")
    .eq("field", "assignee_id")
    .in(
      "issue_id",
      candidates.map((c) => c.id)
    );
  const everAssigned = new Set((touched ?? []).map((e) => e.issue_id as string));

  let assigned = 0;
  for (const candidate of candidates) {
    if (everAssigned.has(candidate.id)) continue;
    try {
      // `trigger: "sweep"` → the call to the model is expected, not deferred, and
      // the actor is zero: no one did anything, the notification therefore goes away
      // even to the person who created the ticket.
      const chosen = await runSmartAssign({
        issueId: candidate.id,
        projectId: candidate.project_id,
        triggerActorId: null,
        trigger: "sweep",
      });
      if (chosen) assigned++;
    } catch (err) {
      // An exploding ticket should not carry the following ones.
      console.error(
        "[smart-assign] sweep failed:",
        candidate.id,
        (err as Error).message
      );
    }
  }
  return { candidates: candidates.length, assigned };
}

/**
 * Projects I AM OWNER OF where Smart Assign is active while at least one member
 * has no rule (MIN-31). Read by the dashboard, which displays
 * the warning: only the owner can write these rules, so only he is
 * warned.
 *
 * The team and the notion of "written rule" read exactly as in
 * runSmartAssign: owner (without project_members line) + members, and a rule
 * empty of blanks does not count. A solo project is never reported — it
 * has nothing to adjust, the assignment is deterministic.
 *
 * Never rejects: it's a warning, it must not be able to make
 * fall off the reading of the dashboard that carries it.
 */
export async function loadSmartAssignConfigWarnings(
  userId: string
): Promise<SmartAssignConfigWarning[]> {
  try {
    const service = getServiceClient();

    const { data: projects, error } = await service
      .from("projects")
      .select("id, name, smart_assign_rules")
      .eq("owner_id", userId)
      .eq("smart_assign_enabled", true)
      .is("deleted_at", null);
    if (error || !projects?.length) return [];

    const projectIds = projects.map((p) => p.id as string);
    const { data: memberRows } = await service
      .from("project_members")
      .select("project_id, user_id")
      .in("project_id", projectIds);

    const teamByProject = new Map<string, Set<string>>();
    for (const id of projectIds) teamByProject.set(id, new Set([userId]));
    for (const row of memberRows ?? []) {
      teamByProject.get(row.project_id as string)?.add(row.user_id as string);
    }

    const warnings: SmartAssignConfigWarning[] = [];
    for (const project of projects) {
      const team = teamByProject.get(project.id as string) ?? new Set([userId]);
      if (team.size <= 1) continue;
      const rules = (project.smart_assign_rules ?? {}) as Record<string, string>;
      const missing = userIdsWithoutRule([...team], rules).length;
      if (missing === 0) continue;
      warnings.push({
        projectId: project.id as string,
        projectName: (project.name as string) ?? "",
        missingCount: missing,
        memberCount: team.size,
      });
    }
    return warnings;
  } catch (err) {
    console.error("[smart-assign] warnings failed:", (err as Error).message);
    return [];
  }
}

/** One forced tool call: the model MUST pick a user_id from the enum. Returns
    the validated id, or null on any failure (no key, HTTP error, bad output). */
async function chooseAssigneeViaAI({
  service,
  projectId,
  projectName,
  issue,
  memberIds,
  ownerId,
  rules,
}: {
  service: SupabaseClient;
  projectId: string;
  projectName: string;
  issue: Record<string, unknown>;
  memberIds: string[];
  ownerId: string;
  rules: Record<string, string>;
}): Promise<string | null> {
  try {
    const [modelCfg, authUsers, { data: categoryRows }] = await Promise.all([
      getAppConfigValues(modelConfigKeys("smart_assign_model")),
      fetchAuthUsersById(service, memberIds),
      service
        .from("issue_categories")
        .select("categories(name)")
        .eq("issue_id", issue.id as string),
    ]);
    const model = resolveFromValues("smart_assign_model", modelCfg).model;

    const memberLines = memberIds
      .map((id) => {
        const name = displayName(toNamed(authUsers.get(id)));
        const owner = id === ownerId ? " [owner]" : "";
        const rule = rules[id]?.trim();
        return `- ${name} (user_id: ${id})${owner}\n  Rule: ${rule || "(no rule)"}`;
      })
      .join("\n");
    const categories = (categoryRows ?? [])
      .map((r) => (r.categories as { name?: string } | null)?.name)
      .filter(Boolean)
      .join(", ");

    const systemPrompt = `You are Smart Assign, minddy's automatic issue router for the project "${projectName}".
A new issue needs an owner. Choose the ONE team member best suited to handle it and call choose_assignee.

Rules:
- You MUST call choose_assignee with exactly one user_id from the member list. Never refuse, never reply in plain text.
- Each member may have an assignment rule: free text written by the project owner describing the kind of tasks they should get (any language). Match the issue against these rules first.
- Use the issue's title, description and categories to identify the type of work; priority and effort are tiebreakers only.
- A member without a rule can still be chosen if nothing else matches better.
- If nothing clearly matches, pick the project owner.`;

    const description =
      typeof issue.description === "string" && issue.description.trim()
        ? issue.description.slice(0, MAX_DESCRIPTION_CHARS)
        : "(none)";
    const userMessage = `## Issue
Title: ${issue.title as string}
Description: ${description}
Categories: ${categories || "None"}
Priority: ${(issue.priority as string) ?? "none"}
Effort: ${(issue.effort as string) ?? "—"}

## Members
${memberLines}`;

    const args = await forcedToolCall(
      model,
      systemPrompt,
      userMessage,
      "choose_assignee",
      {
        type: "object",
        properties: { user_id: { type: "string", enum: memberIds } },
        required: ["user_id"],
        additionalProperties: false,
      },
      {
        xTitle: "Smart Assign (minddy)",
        logPrefix: "[smart-assign]",
        modelKey: "smart_assign_model",
        maxTokens: 256,
        record: {
          feature: "smart_assign",
          billTo: { projectOwner: projectId },
          projectId,
        },
      },
    );
    // Never trust the enum — re-validate against the real member list.
    return typeof args?.user_id === "string" && memberIds.includes(args.user_id)
      ? args.user_id
      : null;
  } catch (err) {
    console.error("[smart-assign] AI choice failed:", (err as Error).message);
    return null;
  }
}

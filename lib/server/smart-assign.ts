import { issueStore } from "@/lib/server/issue-store";
import "server-only";
import { categoryStore } from "@/lib/server/category-store";

import { previouslyAssignedIssues } from "./issue-event-store";
import { afterOrNow } from "@/lib/server/after-safe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { canUseSmartAssign } from "@/lib/server/entitlements";
import { insertEvents } from "@/lib/server/issue-events";
import { insertNotifications } from "@/lib/server/notifications";
import { fetchAuthUsersById } from "@/lib/server/auth-users";
import { runDecision } from "@/lib/server/decisions/runner";
import { prepareSmartAssign } from "@/lib/server/decisions/prepare";
import type { DecisionOutcome } from "@/lib/server/decisions/types";
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
 *   with no rule the model has nothing but names to compare.
 * - Multi-member with rules: one structured decision through the decision
 *   layer (`lib/server/decisions/runner.ts`, MIN-563) — Jev answers on the
 *   structured state first, the existing `choose_assignee` LLM pass is
 *   replayed verbatim as the fallback, and any failure of both falls back to
 *   the owner so the run always assigns someone.
 *
 * The written event carries `smart_assign_ai`: only the third case sets it to
 * true, and only if the decision layer answered a valid member. This is what
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
 * - only the DECISION (Jev, and the LLM pass behind it) remains deferred —
 *   several seconds of latency have nothing to do in a POST — and it is that
 *   alone that the budget keeps;
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
  /** `sweep` = cron catch-up. It has no response to give, so it
      WAITS for the decision instead of deferring it — deferring is precisely
      what caused the assignment it is repairing to be lost. */
  trigger: "create" | "triage_exit" | "sweep";
}

/**
 * Entry point of the two writing cores (creation / update of a
 * ticket): to WAIT, and without a net to place — it never raises.
 *
 * What we wait for is the decision and, in the deterministic case, writing.
 * Not the decision call itself: that one goes to `after()` from `runSmartAssign`.
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
 * had nothing to do, but also when the decision was deferred: at that
 * moment nothing is written yet, and to pretend otherwise would lie to
 * the caller as well as to the sweeper who account.
 */
export async function runSmartAssign(
  params: SmartAssignParams
): Promise<string | null> {
  const service = getServiceClient();

  // The three readings IN PARALLEL: they do not depend on each other, and it
  // is the length of this prelude that decides whether the assignment
  // survives. One clock round trip, not three.
  const [{ data: project }, { data: issue }, { data: memberRows }] =
    await Promise.all([
      service
        .from("projects")
        .select("id, name, owner_id, smart_assign_enabled, smart_assign_rules")
        .eq("id", params.projectId)
        .is("deleted_at", null)
        .maybeSingle(),
      issueStore(service).select("id, title, description, status, priority, effort, assignee_id")
        .is("deleted_at", null)
        .eq("id", params.issueId)
        .eq("project_id", params.projectId)
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
  // possible: without any, the engines only have names to compare, and the
  // prompt already tells the model to fall back on the owner in this case.
  // Might as well not pay the call — the result is the same, cheaper and
  // without latency.
  if (memberIds.length === 1 || !hasAnyRule(memberIds, rules)) {
    // Only member, or no rules: no ambiguity to remove, no AI — therefore
    // nothing to charge, nothing to keep, and no reason to wait for a response
    // to write. This is the case for the vast majority of projects.
    return await claimForSmartAssign(service, params, ownerId, false);
  }

  // Remains the only piece that costs: a few seconds of latency and a line
  // of use. It leaves after the answer — except for the sweeper, who has no
  // response to give.
  const askTheLayer = async (): Promise<string | null> => {
    try {
      // The budget ONLY keeps the expense. Putting it at the head of the run
      // would also suspend deterministic assignments, which cost nothing; and
      // a dry budget or a silent layer, the contract stays the same — we
      // assign someone, failing that the owner.
      if (!(await canUseSmartAssign(ownerId))) return null;
      const [authUsers, { data: categoryRows }] = await Promise.all([
        fetchAuthUsersById(service, memberIds),
        service
          .from("issue_categories")
          .select("category_id")
          .eq("issue_id", params.issueId),
      ]);
      const { data: decodedCategories, error: categoryError } = await categoryStore(service)
        .select("id, name").eq("project_id", params.projectId)
        .in("id", (categoryRows ?? []).map((row) => row.category_id));
      if (categoryError) throw new Error("Unable to read smart-assignment categories");
      const spec = prepareSmartAssign({
        projectName: (project.name as string) ?? "",
        issue: {
          title: issue.title as string,
          description: typeof issue.description === "string" ? issue.description : null,
          priority: (issue.priority as string) ?? null,
          effort: (issue.effort as string) ?? null,
        },
        memberIds,
        ownerId,
        rules,
        authUsers,
        categoryNames: (decodedCategories ?? []).map((row) => row.name as string),
      });
      // One decision, two engines: Jev first on the structured state, the
      // `choose_assignee` LLM pass replayed verbatim as the fallback, one
      // ledger run across both — billed to the project owner, like the pass
      // it replaces.
      const outcome = await runDecision(spec, {
        billTo: { projectOwner: params.projectId },
        projectId: params.projectId,
        // The shadow comparison (MIN-567) traces its sample back to the
        // issue it judged.
        subjectId: params.issueId,
      });
      return smartAssignPickFrom(outcome, memberIds);
    } catch (err) {
      console.error("[smart-assign] AI choice failed:", (err as Error).message);
      return null;
    }
  };
  const claim = async (): Promise<string | null> => {
    const picked = await askTheLayer();
    // Did the layer REALLY choose? The ticket activity says so, and the
    // two modes are not equal: falling back on the owner — a failed call, or
    // an unusable answer — remains an automatic assignment.
    return await claimForSmartAssign(service, params, picked ?? ownerId, picked !== null);
  };
  if (params.trigger === "sweep") return await claim();
  afterOrNow(async () => {
    await claim();
  });
  return null;
}

/**
 * The runner's outcome, replayed as the assignee `claimForSmartAssign` was
 * built on. Pure, and deliberately boring: it copies the `user_id` answer
 * when it is one of the REAL member ids, and `null` otherwise — whichever
 * engine produced the outcome, and whatever else it may have answered. Both
 * adapters already validate against the spec's options; this re-checks
 * against the team the run will actually claim with, and stays the last
 * door before the write.
 */
export function smartAssignPickFrom(
  outcome: DecisionOutcome | null,
  memberIds: string[]
): string | null {
  const value = outcome?.answers.user_id?.value;
  return typeof value === "string" && memberIds.includes(value) ? value : null;
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
    .eq("project_id", params.projectId)
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
        // Without this flag the inbox reads a null actor and displays "Someone" —
        // the timeline already names Smart Assign on the same gesture.
        via_smart_assign: true,
      },
    ]);
  }
  return chosen;
}

/** One team member as the AI pass sees them: resolved name, owner mark and
 * the owner-written rule (raw — the builders trim it). The pure prompt
 * builders below and the decision layer (`lib/server/decisions/prepare.ts`)
 * both consume this shape. */
export interface SmartAssignMember {
  id: string;
  name: string;
  owner: boolean;
  rule: string | null;
}

/** The member block of the prompt: one line per member, rule included. */
export function buildSmartAssignMemberLines(members: SmartAssignMember[]): string {
  return members
    .map((member) => {
      const owner = member.owner ? " [owner]" : "";
      const rule = member.rule?.trim();
      return `- ${member.name} (user_id: ${member.id})${owner}\n  Rule: ${rule || "(no rule)"}`;
    })
    .join("\n");
}

/** The system prompt. Rules first: the per-member written rules are what
 * makes the choice possible, names only break ties. */
export function buildSmartAssignSystemPrompt(projectName: string): string {
  return `You are Smart Assign, minddy's automatic issue router for the project "${projectName}".
A new issue needs an owner. Choose the ONE team member best suited to handle it and call choose_assignee.

Rules:
- You MUST call choose_assignee with exactly one user_id from the member list. Never refuse, never reply in plain text.
- Each member may have an assignment rule: free text written by the project owner describing the kind of tasks they should get (any language). Match the issue against these rules first.
- Use the issue's title, description and categories to identify the type of work; priority and effort are tiebreakers only.
- A member without a rule can still be chosen if nothing else matches better.
- If nothing clearly matches, pick the project owner.`;
}

/** The user message: the issue to route, then the members it can route to. */
export function buildSmartAssignUserMessage(
  issue: {
    title: string;
    description: string | null;
    categories: string;
    priority: string | null;
    effort: string | null;
  },
  memberLines: string
): string {
  const description =
    issue.description && issue.description.trim()
      ? issue.description.slice(0, MAX_DESCRIPTION_CHARS)
      : "(none)";
  return `## Issue
Title: ${issue.title}
Description: ${description}
Categories: ${issue.categories || "None"}
Priority: ${issue.priority ?? "none"}
Effort: ${issue.effort ?? "—"}

## Members
${memberLines}`;
}

/** The tool schema: the model MUST pick a user_id from the enum. */
export function smartAssignParameters(memberIds: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: { user_id: { type: "string", enum: memberIds } },
    required: ["user_id"],
    additionalProperties: false,
  };
}

/**
 * CATCH-UP (cron `/api/cron/smart-assign`): tickets that a
 * trigger should have assigned and which remained without anyone.
 *
 * It exists because there is no guarantee that an `after()` will complete — this is
 * exactly how a ticket created by the MCP remained orphaned, without
 * error, without trace, without retrying. The deterministic case no longer
 * depends on it; the decision does.
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

  const { data: rows, error } = await issueStore(service).select("id, project_id, projects!inner(smart_assign_enabled, deleted_at)")
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

  const everAssigned = await previouslyAssignedIssues(service, candidates.map((c) => c.id));

  let assigned = 0;
  for (const candidate of candidates) {
    if (everAssigned.has(candidate.id)) continue;
    try {
      // `trigger: "sweep"` → the decision is expected, not deferred, and
      // the actor is null: no one did anything, so the notification goes away
      // even for the person who created the ticket.
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

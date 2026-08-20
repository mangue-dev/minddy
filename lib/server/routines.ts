import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { softDeleteItem } from "@/lib/server/trash";
import { getProjectLink } from "@/lib/server/git/repo-links";
import { ensureModelInPlan } from "@/lib/server/agent/model-plan";
import { checkAgentQuota } from "@/lib/server/agent/quota";
import { isPlanLimitError } from "@/lib/server/plan-limit-error";
import { isReasoningLevel, type ReasoningLevel } from "@/lib/agent-reasoning";
import {
  DEFAULT_MAX_SPEND_PERCENT,
  NO_SPEND_CAP_PERCENT,
  clampSpendPercent,
} from "@/lib/routine-budget";
import { generateShortTitle } from "@/lib/server/short-title";
import {
  RoutineScheduleError,
  assertSchedule,
  isRoutineFrequency,
  nextRunAt,
  type RoutineFrequency,
  type RoutineSchedule,
} from "@/lib/routine-schedule";

/**
 * The FACTORY of routines (MIN-185) — just one, for four doors.
 *
 * The wizard, the cat Numo, the agent Numo and the MCP all know how to set a
 * routine; none of the four validate anything. Everything is here: the
 * property guard, the linked deposit, the consistency of the cadence, the ceiling of
 * plan model, the calculation of the next pass. Same doctrine as the MIN-170 ticket factory
 * — four similar validations end up diverging, and it's the least traveled door that lets through.
 *
 * **Only the OWNER of the project creates, modifies or deletes a routine.** A
 * routine commits a budget every Monday morning without anyone clicking:
 * it is up to the person who pays to set it. A member SEES it (read RLS is
 * `can_access_project`) and reads its executions, but is denied writing
 * in `403 ownerOnly` — just like project settings
 * (`update-project.ts`) and inviting members (`members.ts`) *
 * **`ensureModelInPlan` is called AT REGISTRATION**, not at launch: an out-of-plan model must be refused in front of someone, not at 1 p.m. in a cron
 * for which no one reads the logs.
 */

export interface Routine {
  id: string;
  project_id: string;
  owner_id: string;
  title: string;
  prompt: string;
  model: string | null;
  reasoning_level: ReasoningLevel;
  base_branch: string | null;
  /**
 * Share of the plan's monthly usage budget that ONE passage has the right to spend
 * (1–100, 15 by default). See `routineRunBudgetUsd`.
 */
  max_spend_percent: number;
  frequency: RoutineFrequency;
  hour: number;
  minute: number;
  weekdays: number[];
  days_of_month: number[];
  timezone: string;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  /** CODE of the last missed passage, never a sentence — the UI translates. */
  last_error: RoutineErrorCode | string | null;
  created_at: string;
  updated_at: string;
}

/** Missed passage reasons, written by the cron and translated by the UI. */
export type RoutineErrorCode =
  | "quota"
  | "noRepo"
  | "alreadyRunning"
  | "modelAbovePlan"
  | "managedServiceUnavailable"
  | "executionBackendUnavailable"
  | "launchFailed";

export type RoutineErrorKey =
  | "projectNotFound"
  | "ownerOnly"
  | "routineNotFound"
  | "promptRequired"
  | "noRepo"
  | "invalidSchedule"
  | "unknownTimezone"
  | "modelAbovePlan"
  | "noFieldsToUpdate"
  | "databaseError";

export type RoutineResult<T> =
  | { ok: true; routine: T }
  | {
      ok: false;
      status: number;
      errorKey: RoutineErrorKey;
      /** Details of the model refusal, enough to write the complete sentence. */
      modelLimit?: { model: string; multiplier: number; limit: number; planId: string };
      /** Cadence refusal code (`invalidWeekday`, `invalidHour`…). */
      scheduleCode?: string;
    };

/** Writing terminals — beyond that we truncate, like everywhere else (MIN-118). */
const MAX_TITLE_LENGTH = 120;
const MAX_PROMPT_LENGTH = 20_000;
const MAX_MODEL_LENGTH = 200;
const MAX_BRANCH_LENGTH = 255;

/**
 * What ONE pass of this routine is allowed to spend, in USD — the
 * `budget_usd` placed on its run, which the loop makes enforceable.
 *
 * `null` = no own ceiling, and this is true in two cases :
 * - **100%**, the setting which says "only my quota limits me" (the old
 * behavior, kept accessible);
 * - **BYOK**, where the budget of the plan no longer limits anything: the user pays his
 * tokens, and a percentage of a budget which does not concern him would pose
 * a cap that he did not ask for. Same doctrine as the model ceiling
 * (`ensureModelInPlan`), which also only applies to the minddy quota.
 *
 * The basis is the PLAN budget and not the rest of the month: a ceiling which
 * would melt with consumption would make the routine work less and less less
 * far as the month progresses, without its setting having changed. What
 * limits the remainder is the quota — the other half of the `min()` of the loop.
 */
export async function routineRunBudgetUsd(routine: {
  owner_id: string;
  max_spend_percent: number;
}): Promise<number | null> {
  const percent = clampSpendPercent(routine.max_spend_percent);
  if (percent >= NO_SPEND_CAP_PERCENT) return null;
  const quota = await checkAgentQuota(routine.owner_id, "automations");
  if (quota.unlimited || quota.cap == null) return null;
  return (quota.cap * percent) / 100;
}

export interface CreateRoutineInput {
  projectId: string;
  /** Who asks. The owner's guard is on HIM, whatever the door. */
  actorId: string;
  /**
 * NO title: it is WRITTEN by a small model from the instruction,
 * here and nowhere else (cf. `titleFor`). No door offers one —
 * a name given by hand is one more field to fill in for a worse result
 *, and it diverged from the instruction from the first rewrite.
 */
  prompt: string;
  model?: string | null;
  reasoningLevel?: string | null;
  baseBranch?: string | null;
  /** Plafond d'un passage, en % du budget mensuel (1–100). Absent → 15. */
  maxSpendPercent?: number | null;
  frequency: string;
  hour: number;
  minute?: number | null;
  weekdays?: number[] | null;
  daysOfMonth?: number[] | null;
  timezone: string;
  enabled?: boolean;
}

/** Cadence fields read from raw input, normalized. */
function toSchedule(input: {
  frequency: string;
  hour: number;
  minute?: number | null;
  weekdays?: number[] | null;
  daysOfMonth?: number[] | null;
  timezone: string;
}): RoutineSchedule {
  const frequency = isRoutineFrequency(input.frequency) ? input.frequency : "weekly";
  // Deduplicated and sorted upon entry: twice on the same day is not two
  // occurrences, and the order of entry does not have to survive until display.
  const uniq = (days: number[] | null | undefined) =>
    [...new Set(days ?? [])].sort((a, b) => a - b);
  return {
    frequency,
    hour: Number(input.hour),
    minute: Number(input.minute ?? 0),
    // Daytime fields ONLY exist for their cadence: let them drag
    // from one cadence to another would make `assertSchedule` seem like a whim.
    weekdays: frequency === "weekly" ? uniq(input.weekdays) : [],
    daysOfMonth: frequency === "monthly" ? uniq(input.daysOfMonth) : [],
    timezone: String(input.timezone ?? ""),
  };
}

/**
 * The TITLE of a routine: written by the small model which already names the
 * notebook sessions and Numo's conversations, from its instruction.
 *
 * It is never requested from the user, and it REDOES each time
 * the instruction changes: a name entered once stops describing the routine as soon as
 * the first rewrite, and no one thinks to correct it. The call costs
 * a few cents of a thousand tokens, once per edition — to compare to
 * title that MIN-185 rightly removed from the launch, which was repaid for EACH
 * passage.
 *
 * The expense is that of routine (`routine_code`), like everything else it
 * does.
 *
 * Fallback if the model does not respond: the first sentence of the instruction,
 * cut off. An untitled routine has no readable line in the column.
 */
async function titleFor(prompt: string, userId: string, projectId: string): Promise<string> {
  const generated = await generateShortTitle({
    text: prompt,
    kind: "note",
    // The language of the title is that of the instruction, without having to
    // know here — this is the person who wrote it.
    locale: "auto",
    usage: { feature: "routine_code", userId, projectId },
  }).catch(() => null);
  if (generated?.trim()) return generated.trim().slice(0, MAX_TITLE_LENGTH);
  const first = prompt.trim().split(/[.\n!?]/)[0]?.trim() ?? "";
  return (first || prompt.trim()).slice(0, MAX_TITLE_LENGTH);
}

/** Translates a cadence refusal into a factory result. */
function scheduleRefusal(err: unknown): Extract<RoutineResult<never>, { ok: false }> | null {
  if (!(err instanceof RoutineScheduleError)) return null;
  return err.code === "unknownTimezone"
    ? { ok: false, status: 400, errorKey: "unknownTimezone", scheduleCode: err.code }
    : { ok: false, status: 400, errorKey: "invalidSchedule", scheduleCode: err.code };
}

/**
 * The template cap of the plan, applied to the chosen template for the
 * routine. BYOK users choose their own models without this ceiling.
 */
async function refuseModelAbovePlan(
  userId: string,
  model: string | null,
): Promise<Extract<RoutineResult<never>, { ok: false }> | null> {
  if (!model) return null;
  const quota = await checkAgentQuota(userId, "automations");
  try {
    await ensureModelInPlan({ userId, model, mode: quota.mode });
    return null;
  } catch (err) {
    if (isPlanLimitError(err) && err.code === "model_above_plan") {
      const p = err.params ?? {};
      return {
        ok: false,
        status: 403,
        errorKey: "modelAbovePlan",
        modelLimit: {
          model: String(p.model ?? model),
          multiplier: Number(p.multiplier ?? 0),
          limit: Number(p.limit ?? 0),
          planId: String(p.plan ?? ""),
        },
      };
    }
    throw err;
  }
}

/** Creates a routine. Project owner only. */
export async function createRoutine(
  input: CreateRoutineInput,
): Promise<RoutineResult<Routine>> {
  const access = await getProjectAccess(input.actorId, input.projectId);
  if (!access) return { ok: false, status: 404, errorKey: "projectNotFound" };
  // Guard BEFORE everything else: no need to validate a cadence that we are going to
  // refuse, and the refusal must be the same regardless of the door.
  if (!access.isOwner) return { ok: false, status: 403, errorKey: "ownerOnly" };

  const prompt = input.prompt?.trim() ?? "";
  if (!prompt) return { ok: false, status: 400, errorKey: "promptRequired" };

  // Without a linked repository, the routine would have nothing to clone: ​​we rather refuse here
  // than letting a routine break with each pass.
  const link = await getProjectLink(input.projectId);
  if (!link) return { ok: false, status: 409, errorKey: "noRepo" };

  const schedule = toSchedule(input);
  let next: Date;
  try {
    next = nextRunAt(schedule, new Date());
  } catch (err) {
    const refusal = scheduleRefusal(err);
    if (refusal) return refusal;
    throw err;
  }

  const model = input.model?.trim() ? input.model.trim().slice(0, MAX_MODEL_LENGTH) : null;
  const refusal = await refuseModelAbovePlan(input.actorId, model);
  if (refusal) return refusal;

  // The title LAST: after all the refusals, to avoid paying a call from
  // naming a routine that we are about to refuse.
  const title = await titleFor(prompt, input.actorId, input.projectId);
  const enabled = input.enabled !== false;
  const service = getServiceClient();
  const { data, error } = await service
    .from("agent_routines")
    .insert({
      project_id: input.projectId,
      // Technical actor = the owner, that is to say the caller (the guard above
      // guarantees it). Written in a column so the cron doesn't have to re-join.
      owner_id: input.actorId,
      title,
      prompt: prompt.slice(0, MAX_PROMPT_LENGTH),
      model,
      reasoning_level: isReasoningLevel(input.reasoningLevel)
        ? input.reasoningLevel
        : "medium",
      base_branch: input.baseBranch?.trim()
        ? input.baseBranch.trim().slice(0, MAX_BRANCH_LENGTH)
        : null,
      // Brought back within its limits rather than refused: a poorly written ceiling by a
      // of the four doors should not prevent the routine from being established — the CHECK
      // from the base, he would not forgive.
      max_spend_percent:
        input.maxSpendPercent == null
          ? DEFAULT_MAX_SPEND_PERCENT
          : clampSpendPercent(input.maxSpendPercent),
      frequency: schedule.frequency,
      hour: schedule.hour,
      minute: schedule.minute,
      weekdays: schedule.weekdays,
      days_of_month: schedule.daysOfMonth,
      timezone: schedule.timezone,
      enabled,
      // A disarmed routine has no deadline: the partial cron index does not
      // doesn't see it, and reactivating it recalculates it.
      next_run_at: enabled ? next.toISOString() : null,
    })
    .select("*")
    .single();
  if (error || !data) {
    console.error("[routines] create failed:", error?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, routine: data as Routine };
}

export interface UpdateRoutineInput {
  routineId: string;
  actorId: string;
  /** Rewrite the instruction REDOES the title: cf. `titleFor`. */
  prompt?: string;
  model?: string | null;
  reasoningLevel?: string | null;
  baseBranch?: string | null;
  /** Nouveau plafond d'un passage, en % du budget mensuel (1–100). */
  maxSpendPercent?: number | null;
  frequency?: string;
  hour?: number;
  minute?: number | null;
  weekdays?: number[] | null;
  daysOfMonth?: number[] | null;
  timezone?: string;
  enabled?: boolean;
}

/**
 * Modifies a routine. Owner alone.
 *
 * Any key to the cadence or to `enabled` RECALCULATES `next_run_at`: without that,
 * changing the time would not change anything before the next passage — and reactivating
 * a routine would make it start on an expired deadline, so immediately.
 */
export async function updateRoutine(
  input: UpdateRoutineInput,
): Promise<RoutineResult<Routine>> {
  const service = getServiceClient();
  const { data: current } = await service
    .from("agent_routines")
    .select("*")
    // A trashed routine cannot be modified: it is first restored.
    .is("deleted_at", null)
    .eq("id", input.routineId)
    .maybeSingle();
  if (!current) return { ok: false, status: 404, errorKey: "routineNotFound" };
  const routine = current as Routine;

  const access = await getProjectAccess(input.actorId, routine.project_id);
  if (!access) return { ok: false, status: 404, errorKey: "routineNotFound" };
  if (!access.isOwner) return { ok: false, status: 403, errorKey: "ownerOnly" };

  const updates: Record<string, unknown> = {};
  if (typeof input.prompt === "string") {
    const prompt = input.prompt.trim();
    if (!prompt) return { ok: false, status: 400, errorKey: "promptRequired" };
    updates.prompt = prompt.slice(0, MAX_PROMPT_LENGTH);
    // The title FOLLOWS the instruction. A routine whose work has been rewritten
    // would otherwise keep the name of what she did before — and that’s the name
    // which we read in the column to decide if it is still useful.
    if (prompt !== routine.prompt) {
      updates.title = await titleFor(prompt, input.actorId, routine.project_id);
    }
  }
  if ("model" in input) {
    const model = input.model?.trim() ? input.model.trim().slice(0, MAX_MODEL_LENGTH) : null;
    const refusal = await refuseModelAbovePlan(input.actorId, model);
    if (refusal) return refusal;
    updates.model = model;
  }
  if (input.reasoningLevel != null) {
    if (isReasoningLevel(input.reasoningLevel)) updates.reasoning_level = input.reasoningLevel;
  }
  if ("baseBranch" in input) {
    updates.base_branch = input.baseBranch?.trim()
      ? input.baseBranch.trim().slice(0, MAX_BRANCH_LENGTH)
      : null;
  }
  if (input.maxSpendPercent != null) {
    updates.max_spend_percent = clampSpendPercent(input.maxSpendPercent);
  }

  // The cadence is reread ENTIRELY, merging what exists and what changes:
  // validating an isolated field would allow “monthly + a weekday” to pass,
  // which is only consistent with two.
  const cadenceTouched =
    input.frequency !== undefined ||
    input.hour !== undefined ||
    input.minute !== undefined ||
    input.weekdays !== undefined ||
    input.daysOfMonth !== undefined ||
    input.timezone !== undefined;
  const enabledTouched = typeof input.enabled === "boolean";
  const enabled = enabledTouched ? (input.enabled as boolean) : routine.enabled;

  let schedule: RoutineSchedule | null = null;
  if (cadenceTouched || enabledTouched) {
    schedule = toSchedule({
      frequency: input.frequency ?? routine.frequency,
      hour: input.hour ?? routine.hour,
      minute: input.minute ?? routine.minute,
      weekdays: input.weekdays !== undefined ? input.weekdays : routine.weekdays,
      daysOfMonth:
        input.daysOfMonth !== undefined ? input.daysOfMonth : routine.days_of_month,
      timezone: input.timezone ?? routine.timezone,
    });
    try {
      const next = nextRunAt(schedule, new Date());
      updates.next_run_at = enabled ? next.toISOString() : null;
    } catch (err) {
      const refusal = scheduleRefusal(err);
      if (refusal) return refusal;
      throw err;
    }
    if (cadenceTouched) {
      updates.frequency = schedule.frequency;
      updates.hour = schedule.hour;
      updates.minute = schedule.minute;
      updates.weekdays = schedule.weekdays;
      updates.days_of_month = schedule.daysOfMonth;
      updates.timezone = schedule.timezone;
    }
    if (enabledTouched) updates.enabled = enabled;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, errorKey: "noFieldsToUpdate" };
  }

  const { data, error } = await service
    .from("agent_routines")
    .update(updates)
    .eq("id", input.routineId)
    .select("*")
    .single();
  if (error || !data) {
    console.error("[routines] update failed:", error?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, routine: data as Routine };
}

/**
 * Deletes a routine — in the TRASH (MIN-201), not for good.
 *
 * It was a dry `delete`, and it took all its passages with it
 * (`agent_runs.routine_id` cascade): the conversations, the diffs and the pull
 * requests that read there disappeared with a click, with no possible return. The
 * routine therefore leaves where the tickets, objectives, returns
 * and projects already leave: marked, exit from the app, restoreable for 30 days identically
 * — cadence, instruction, model, deadline and history unchanged, since nothing
 * is detached. It's the nightly scan that decides next.
 *
 * The owner guard AND the writing live in `softDeleteItem`: two
 * implementations of “trash a routine” — one here, one for the screen of
 * trash and the Numo tool — would end up diverge.
 */
export async function deleteRoutine(input: {
  routineId: string;
  actorId: string;
}): Promise<{ ok: true } | Extract<RoutineResult<never>, { ok: false }>> {
  const result = await softDeleteItem("routine", input.routineId, input.actorId);
  if (result.ok) return { ok: true };
  // The basket only returns, for a routine, these three keys; the withdrawal
  // cover the impossible rather than letting a key pass that the UI doesn't know
  // pas traduire.
  const errorKey: RoutineErrorKey =
    result.errorKey === "routineNotFound" || result.errorKey === "ownerOnly"
      ? result.errorKey
      : "databaseError";
  return { ok: false, status: result.status, errorKey };
}

/**
 * A routine by its id, with caller access (read = members). A
 * trash routine no longer exists for anyone (MIN-201): it is
 * restored from the trash, it is not reread by its old URL.
 */
export async function getRoutineForUser(
  routineId: string,
  userId: string,
): Promise<{ routine: Routine; isOwner: boolean } | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_routines")
    .select("*")
    .eq("id", routineId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const routine = data as Routine;
  const access = await getProjectAccess(userId, routine.project_id);
  if (!access) return null;
  return { routine, isOwner: access.isOwner };
}

/**
 * Project routines accessible to the user — owner AND members. The
 * reading is open: a member must be able to see what is running on the repository
 * that they share, even if they cannot put it down or stop it.
 */
export async function listRoutinesForUser(userId: string): Promise<Routine[]> {
  const service = getServiceClient();
  const { data: owned } = await service
    .from("projects")
    .select("id")
    .eq("owner_id", userId)
    .is("deleted_at", null);
  const { data: member } = await service
    .from("project_members")
    .select("project_id")
    .eq("user_id", userId);
  const ids = new Set<string>([
    ...((owned ?? []) as { id: string }[]).map((p) => p.id),
    ...((member ?? []) as { project_id: string }[]).map((m) => m.project_id),
  ]);
  if (ids.size === 0) return [];

  const { data } = await service
    .from("agent_routines")
    // Same guard as the cron scan: a trashed project leaves the
    // list. Path "member" cannot filter `deleted_at` itself
    // (`project_members` does not carry it), and without this join a member
    // read in the column a routine whose detail corresponds to 404 —
    // `getProjectAccess` discards trashed projects.
    .select("*, projects!inner(deleted_at)")
    .is("projects.deleted_at", null)
    // And the routine itself, trashed in turn (MIN-201).
    .is("deleted_at", null)
    .in("project_id", [...ids])
    .order("created_at", { ascending: false });
  return ((data ?? []) as Array<Routine & { projects?: unknown }>).map(
    ({ projects: _joined, ...routine }) => routine as Routine,
  );
}

/**
 * Routines whose deadline has passed — scanning the cron.
 *
 * **A project in the TRASH no longer makes anyone work.** Deleting
 * of a project is gentle (`deleted_at`, MIN-133): the routine survives sa
 * line — and without this filter it would start every Monday on a project that
 * its owner believes deleted, by spending his budget, without appearing anywhere
 * share in the screen (`listRoutinesForUser` excludes trashed projects,
 * like `getProjectAccess`). Same doctrine as the automation engine,
 * which excludes trashed projects from its own scanning.
 *
 * **A routine in the trash either** (MIN-201): its deadline remains armed
 * so that the restoration returns it as it is, and without this filter it
 * would leave during its retention as if nothing had happened.
 *
 * The join is INTERNAL and the filter is IN the query, never after:
 * discarded in JS, a trashed project routine would keep its place at the top of
 * the window (its deadline does not moves more, so it always sorts first) and
 * would starve live routines.
 */
export async function dueRoutines(limit = 20): Promise<Routine[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_routines")
    .select("*, projects!inner(deleted_at)")
    .is("projects.deleted_at", null)
    .is("deleted_at", null)
    .eq("enabled", true)
    .not("next_run_at", "is", null)
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at", { ascending: true })
    .limit(limit);
  // The join adds a key to the return: it does not travel further.
  return ((data ?? []) as Array<Routine & { projects?: unknown }>).map(
    ({ projects: _joined, ...routine }) => routine as Routine,
  );
}

/**
 * RESERVES a deadline: compare-and-set on `next_run_at`. This is the ONLY
 * lock against a double start — two overlapping crons read the same
 * routine, only one wins the write, the other leaves without casting anything. Same
 * doctrine that `claim_agent_run`.
 *
 * We advance the deadline BEFORE launching, and we never make up for missed passages
 *: a routine left for three days without a budget starts again tomorrow, it does not
 * play three times.
 */
export async function claimRoutine(
  routine: Routine,
): Promise<{ claimed: boolean; nextRunAt: string | null }> {
  if (!routine.next_run_at) return { claimed: false, nextRunAt: null };
  const schedule = routineSchedule(routine);
  let next: string | null;
  try {
    // Since NOW and not since the missed deadline: a reawakened routine
    // late must start again on the next real occurrence.
    next = nextRunAt(schedule, new Date()).toISOString();
  } catch {
    // Cadence become unreadable (time zone removed from ICU, data tinkered with): we
    // disarm rather than replaying it in a loop each time the cron wakes up.
    next = null;
  }

  const service = getServiceClient();
  const { data, error } = await service
    .from("agent_routines")
    .update({ next_run_at: next, last_run_at: new Date().toISOString() })
    .eq("id", routine.id)
    // The compare-and-set: the deadline that we read must still be there.
    .eq("next_run_at", routine.next_run_at)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[routines] claim failed:", error.message);
    return { claimed: false, nextRunAt: null };
  }
  return { claimed: !!data, nextRunAt: next };
}

/**
 * "Launch now": the pass is not the one on the calendar, but it's in
 * is a — `last_run_at` says so, and the alert for the previous pass goes off,
 * exactly like the cron does when its launch leaves.
 *
 * Without that, a hand-triggered pass left `last_run_at` on the previous
 * deadline, and the two surfaces that render it (cat's `list_routines` and
 * MCP, both announced as "when it ran for the last
 * time") responded next to it. **`next_run_at` is not affected**: try your
 * routine on a Tuesday does not skip the following Monday.
 */
export async function stampRoutineLaunched(routineId: string): Promise<void> {
  const service = getServiceClient();
  const { error } = await service
    .from("agent_routines")
    .update({ last_run_at: new Date().toISOString(), last_error: null })
    .eq("id", routineId);
  if (error) console.error("[routines] stamp launch failed:", error.message);
}

/**
 * Writes the reason for the last pass — a CODE, never a phrase. `null` clears
 * (a passage that restarts normally should clear the alert from the screen).
 */
export async function stampRoutineError(
  routineId: string,
  code: RoutineErrorCode | null,
): Promise<void> {
  const service = getServiceClient();
  const { error } = await service
    .from("agent_routines")
    .update({ last_error: code })
    .eq("id", routineId);
  if (error) console.error("[routines] stamp error failed:", error.message);
}

/** The cadence of a routine, such as `describeSchedule`/`nextRunAt` expects it. */
export function routineSchedule(routine: Routine): RoutineSchedule {
  return {
    frequency: routine.frequency,
    hour: routine.hour,
    minute: routine.minute,
    weekdays: routine.weekdays,
    daysOfMonth: routine.days_of_month,
    timezone: routine.timezone,
  };
}

/** Sanity: the cadence of a routine is valid (useful to external callers). */
export function isValidSchedule(schedule: RoutineSchedule): boolean {
  try {
    assertSchedule(schedule);
    return true;
  } catch {
    return false;
  }
}

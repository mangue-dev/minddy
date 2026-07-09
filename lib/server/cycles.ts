import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { insertEvents, type EventRow } from "@/lib/server/issue-events";
import { resolveCyclePrefs, type CyclePrefs } from "@/lib/cycle-prefs";
import {
  computeTargetPoints,
  cycleFilledPoints,
  cycleCompletedPoints,
  cycleWindows,
  fillCycle,
  todayISO,
  type FillWeights,
  type RecoIssue,
} from "@/lib/cycle";
import type { CycleInfo, CycleIntensity, IssueRelation } from "@/lib/types";
import type { IssueStatus } from "@/lib/issue-constants";

/**
 * Server cores for Cycles (MIN-32). Cycles have NO cron: everything is
 * reconciled lazily by ensureCycles at read time (board GET, Numo tools,
 * capture jobs). Concurrency safety relies on the DB, not on locks:
 *   - unique(user_id, start_date) + upsert ignoreDuplicates → two simultaneous
 *     board loads can never double-create a window;
 *   - the one-shot auto-fill is claimed via `filled_at IS NULL`;
 *   - closing snapshots CAS on `completed_points IS NULL`.
 * All writes go through the service client (RLS only exposes SELECT-own).
 *
 * Known drift, accepted: an issue cycled in a project the user lost access to
 * disappears from their board (user client) but still counts here (service
 * client) — the capacity ring may read slightly different on both sides.
 */

export interface CycleRow {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  intensity: CycleIntensity;
  target_points: number;
  completed_points: number | null;
  filled_at: string | null;
}

/** Statuses eligible for the fill pool and kept by the rollover — real, living
    work. done stays in its (past) cycle as history. */
export const CYCLE_OPEN_STATUSES: readonly IssueStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
];

export function toCycleInfo(row: CycleRow): CycleInfo {
  return {
    id: row.id,
    start_date: row.start_date,
    end_date: row.end_date,
    intensity: row.intensity,
    target_points: row.target_points,
    completed_points: row.completed_points,
  };
}

const CYCLE_SELECT =
  "id, user_id, start_date, end_date, intensity, target_points, completed_points, filled_at";

/** Most recent completed_points at this intensity (recent first, ≤3). */
function calibrationOf(rows: CycleRow[], intensity: CycleIntensity): number[] {
  return rows
    .filter((r) => r.intensity === intensity && r.completed_points !== null)
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
    .slice(0, 3)
    .map((r) => r.completed_points as number);
}

export interface EnsuredCycles {
  current: CycleRow | null;
  upcoming: CycleRow[];
  past: CycleRow[];
}

/**
 * Lazy reconciliation — the ONLY place cycles are created, closed and
 * auto-filled. Idempotent and cheap when the timeline is already current
 * (one select). Never throws: callers get a degraded (possibly stale) result
 * and the next read retries.
 */
export async function ensureCycles({
  service,
  userId,
  prefs,
  today,
}: {
  service: SupabaseClient;
  userId: string;
  prefs: CyclePrefs;
  today: string;
}): Promise<EnsuredCycles> {
  try {
    return await reconcileCycles({ service, userId, prefs, today });
  } catch (err) {
    console.error("[cycles] ensure failed:", (err as Error).message);
    return { current: null, upcoming: [], past: [] };
  }
}

async function reconcileCycles({
  service,
  userId,
  prefs,
  today,
}: {
  service: SupabaseClient;
  userId: string;
  prefs: CyclePrefs;
  today: string;
}): Promise<EnsuredCycles> {
  const cadence = { startDow: prefs.startDow, durationWeeks: prefs.durationWeeks };

  const { data: rowsData, error } = await service
    .from("cycles")
    .select(CYCLE_SELECT)
    .eq("user_id", userId)
    .order("start_date", { ascending: false })
    .limit(24);
  if (error) throw new Error(error.message);
  let rows = (rowsData ?? []) as CycleRow[];

  // 1. Close every past cycle that was never closed: snapshot the points
  //    actually completed (done issues keep their cycle_id as history).
  const unclosed = rows
    .filter((r) => r.end_date <= today && r.completed_points === null)
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  for (const cycle of unclosed) {
    const { data: cycleIssues } = await service
      .from("issues")
      .select("effort, status")
      .eq("cycle_id", cycle.id);
    const completed = cycleCompletedPoints(
      (cycleIssues ?? []) as { effort: RecoIssue["effort"]; status: IssueStatus }[]
    );
    // CAS on "still unclosed" — a concurrent reconcile computes the same value.
    await service
      .from("cycles")
      .update({ completed_points: completed })
      .eq("id", cycle.id)
      .is("completed_points", null);
    cycle.completed_points = completed;
  }

  // 2. Create the missing windows: the one containing today, plus the upcoming
  //    ones. If a row with a DIFFERENT geometry already covers today (prefs
  //    changed mid-cycle), it stays the current cycle until it ends — only
  //    windows starting after it are created.
  const existingCurrent =
    rows.find((r) => r.start_date <= today && today < r.end_date) ?? null;
  const windows = cycleWindows(cadence, today, prefs.upcomingCount);
  const currentEnd = existingCurrent?.end_date ?? windows[0].end_date;
  const target = computeTargetPoints(prefs.intensity, calibrationOf(rows, prefs.intensity));
  const missing = windows.filter(
    (w) =>
      (w.start_date === windows[0].start_date
        ? !existingCurrent
        : w.start_date >= currentEnd) &&
      !rows.some((r) => r.start_date === w.start_date)
  );
  if (missing.length > 0) {
    const { error: upsertError } = await service.from("cycles").upsert(
      missing.map((w) => ({
        user_id: userId,
        start_date: w.start_date,
        end_date: w.end_date,
        intensity: prefs.intensity,
        target_points: target,
      })),
      { onConflict: "user_id,start_date", ignoreDuplicates: true }
    );
    if (upsertError) throw new Error(upsertError.message);
    const { data: refreshed } = await service
      .from("cycles")
      .select(CYCLE_SELECT)
      .eq("user_id", userId)
      .order("start_date", { ascending: false })
      .limit(24);
    rows = (refreshed ?? []) as CycleRow[];
  }

  const current =
    rows.find((r) => r.start_date <= today && today < r.end_date) ?? null;
  const past = rows
    .filter((r) => r.end_date <= today)
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  const upcoming = rows
    .filter((r) => r.start_date > today)
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
    .slice(0, prefs.upcomingCount);

  if (current) {
    // 3. Auto-rollover: unfinished issues of past cycles slide into the
    //    current one (assignment unchanged — the SQL trigger keeps them valid).
    const pastIds = past.map((r) => r.id);
    if (pastIds.length > 0) {
      await service
        .from("issues")
        .update({ cycle_id: current.id })
        .in("cycle_id", pastIds)
        .in("status", CYCLE_OPEN_STATUSES as string[]);
    }

    // 4. Re-align current + future snapshots when the intensity pref changed
    //    (past cycles stay frozen for calibration).
    const misaligned = [current, ...upcoming].filter(
      (r) => r.intensity !== prefs.intensity
    );
    for (const row of misaligned) {
      await service
        .from("cycles")
        .update({ intensity: prefs.intensity, target_points: target })
        .eq("id", row.id);
      row.intensity = prefs.intensity;
      row.target_points = target;
    }

    // 5. One-shot deterministic auto-fill of the current cycle. The claim on
    //    filled_at guarantees a single winner across concurrent reads.
    if (current.filled_at === null) {
      const { data: claimed } = await service
        .from("cycles")
        .update({ filled_at: new Date().toISOString() })
        .eq("id", current.id)
        .is("filled_at", null)
        .select("id")
        .maybeSingle();
      if (claimed) {
        await fillCycleForUser({ service, userId, actorId: null, cycle: current });
      }
    }
  }

  return { current, upcoming, past };
}

/**
 * Top up a cycle with the deterministic engine — shared by the auto-fill and
 * Numo's fill_cycle (weights = the "steer by a phrase" overrides). Pool:
 * issues assigned to the user, open status, not yet in a cycle, from live
 * projects. Respects `blocks` precedence and fills small-first up to the
 * cycle's target.
 */
export async function fillCycleForUser({
  service,
  userId,
  actorId,
  cycle,
  weights,
  viaAssistant = false,
}: {
  service: SupabaseClient;
  userId: string;
  /** Who steered the fill (Numo call) — null for the automatic engine. */
  actorId: string | null;
  cycle: CycleRow;
  weights?: FillWeights;
  viaAssistant?: boolean;
}): Promise<{ pickedIds: string[]; points: number }> {
  const [{ data: candidateRows }, { data: cycleIssues }] = await Promise.all([
    service
      .from("issues")
      .select(
        "id, project_id, title, status, priority, effort, issue_categories(category_id), projects!inner(deleted_at)"
      )
      .eq("assignee_id", userId)
      .is("cycle_id", null)
      .in("status", CYCLE_OPEN_STATUSES as string[])
      .is("projects.deleted_at", null),
    service.from("issues").select("effort, status").eq("cycle_id", cycle.id),
  ]);

  const candidates: RecoIssue[] = (candidateRows ?? []).map((row) => ({
    id: row.id as string,
    project_id: row.project_id as string,
    title: (row.title as string) ?? "",
    status: row.status as IssueStatus,
    priority: row.priority as RecoIssue["priority"],
    effort: (row.effort as RecoIssue["effort"]) ?? null,
    category_ids: ((row.issue_categories ?? []) as { category_id: string }[]).map(
      (c) => c.category_id
    ),
  }));
  if (candidates.length === 0) return { pickedIds: [], points: 0 };

  // Precedence: the blocks edges targeting the candidates, plus the status of
  // every blocker (a candidate blocked by an open issue is skipped unless the
  // blocker gets picked too).
  const candidateIds = candidates.map((c) => c.id);
  const { data: relationRows } = await service
    .from("issue_relations")
    .select("id, source_id, target_id, type")
    .eq("type", "blocks")
    .in("target_id", candidateIds);
  const relations = (relationRows ?? []) as IssueRelation[];

  const statusById = new Map<string, IssueStatus>(
    candidates.map((c) => [c.id, c.status])
  );
  const blockerIds = [...new Set(relations.map((r) => r.source_id))].filter(
    (id) => !statusById.has(id)
  );
  if (blockerIds.length > 0) {
    const { data: blockerRows } = await service
      .from("issues")
      .select("id, status")
      .in("id", blockerIds);
    for (const row of blockerRows ?? []) {
      statusById.set(row.id as string, row.status as IssueStatus);
    }
  }

  const alreadyFilledPoints = cycleFilledPoints(
    (cycleIssues ?? []) as { effort: RecoIssue["effort"]; status: IssueStatus }[]
  );
  const { picked } = fillCycle({
    candidates,
    relations,
    statusById,
    targetPoints: cycle.target_points,
    alreadyFilledPoints,
    weights,
  });
  if (picked.length === 0) return { pickedIds: [], points: 0 };

  // CAS per row: only claim issues still cycle-less and still the user's, so a
  // concurrent manual change wins. The select-back tells us what really landed.
  const { data: updated } = await service
    .from("issues")
    .update({ cycle_id: cycle.id })
    .in("id", picked)
    .is("cycle_id", null)
    .eq("assignee_id", userId)
    .select("id, effort, status");
  const pickedIds = (updated ?? []).map((r) => r.id as string);

  const events: EventRow[] = pickedIds.map((issueId) => ({
    issue_id: issueId,
    actor_id: actorId,
    type: "updated",
    field: "cycle_id",
    from_value: null,
    to_value: cycle.id,
    via_assistant: viaAssistant || undefined,
  }));
  await insertEvents(service, events);

  const points = cycleFilledPoints(
    (updated ?? []) as { effort: RecoIssue["effort"]; status: IssueStatus }[]
  );
  return { pickedIds, points };
}

/** Assignee-side cycle prefs, read from auth user_metadata via the admin API. */
export async function getCyclePrefsForUser(
  service: SupabaseClient,
  userId: string
): Promise<CyclePrefs> {
  const { data } = await service.auth.admin.getUserById(userId);
  return resolveCyclePrefs(
    (data?.user?.user_metadata ?? null) as Record<string, unknown> | null
  );
}

export interface CycleCaptureParams {
  issueId: string;
  /** The issue's assignee — whose cycle (and prefs) the capture targets. */
  userId: string;
  actorId: string | null;
  transition: "started" | "completed";
}

/**
 * Auto-capture (fire-and-forget, pattern of scheduleSmartAssign): when an
 * issue assigned to a cycles-enabled user transitions to in_progress or done
 * without being in a cycle, it joins that user's CURRENT cycle. Re-checks
 * everything at execution time, so a stale schedule is a silent no-op.
 */
export function scheduleCycleCapture(params: CycleCaptureParams): void {
  after(() =>
    runCycleCapture(params).catch((e) =>
      console.error("[cycles] capture failed:", (e as Error).message)
    )
  );
}

export async function runCycleCapture(params: CycleCaptureParams): Promise<void> {
  const service = getServiceClient();

  const prefs = await getCyclePrefsForUser(service, params.userId);
  const wanted =
    params.transition === "started"
      ? prefs.autoCaptureStarted
      : prefs.autoCaptureCompleted;
  if (!prefs.enabled || !wanted) return;

  const { data: issue } = await service
    .from("issues")
    .select("id, assignee_id, cycle_id, status")
    .eq("id", params.issueId)
    .maybeSingle();
  if (!issue || issue.cycle_id !== null) return;
  if (issue.assignee_id !== params.userId) return;
  const expected = params.transition === "started" ? "in_progress" : "done";
  if (issue.status !== expected) return;

  // No user timezone here — UTC today is close enough for a boundary-hour
  // capture landing one cycle off; the rollover self-heals it.
  const { current } = await ensureCycles({
    service,
    userId: params.userId,
    prefs,
    today: todayISO(),
  });
  if (!current) return;

  const { data: claimed } = await service
    .from("issues")
    .update({ cycle_id: current.id })
    .eq("id", params.issueId)
    .is("cycle_id", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  await insertEvents(service, [
    {
      issue_id: params.issueId,
      actor_id: params.actorId,
      type: "updated",
      field: "cycle_id",
      from_value: null,
      to_value: current.id,
    },
  ]);
}

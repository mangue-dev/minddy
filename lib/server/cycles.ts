import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { insertEvents, type EventRow } from "@/lib/server/issue-events";
import { resolveCyclePrefs, type CyclePrefs } from "@/lib/cycle-prefs";
import {
  blockedSet,
  calibrationFactor,
  computeTargetPoints,
  cycleCompletionPercent,
  cycleFilledPoints,
  cycleCompletedPoints,
  cycleWindows,
  diffDays,
  effortToPoints,
  fillCycle,
  pickEvictions,
  recoScore,
  todayISO,
  type CalibrationSample,
  type FillWeights,
  type RecoIssue,
} from "@/lib/cycle";
import type { CycleInfo, CycleIntensity, IssueRelation } from "@/lib/types";
import { issueIdentifier, type IssueStatus } from "@/lib/issue-constants";

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

/** The user's calendar date in `tz` (stats pattern) — UTC on a bad/missing tz. */
export function todayInTz(tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC" }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date());
  }
}

const CYCLE_SELECT =
  "id, user_id, start_date, end_date, intensity, target_points, completed_points, filled_at";

/** Closed cycles as calibration samples, most recent first. Intensity and
    duration ride along so lib/cycle can normalize each sample by its own
    weekly base — the factor then scales all three levels together. */
function calibrationSamplesOf(rows: CycleRow[]): CalibrationSample[] {
  return rows
    .filter((r) => r.completed_points !== null)
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
    .map((r) => ({
      completed: r.completed_points as number,
      intensity: r.intensity,
      weeks: Math.max(1, Math.round(diffDays(r.start_date, r.end_date) / 7)),
    }));
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
      .eq("cycle_id", cycle.id)
      .is("deleted_at", null);
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
  const factor = calibrationFactor(calibrationSamplesOf(rows));
  const target = computeTargetPoints(prefs.intensity, factor, prefs.durationWeeks);
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
        .in("status", CYCLE_OPEN_STATUSES as string[])
        .is("deleted_at", null);
    }

    // 4. Re-align current + future snapshots whenever the freshly computed
    //    target differs — intensity change, base/scale change, calibration
    //    drift — so a settings tweak applies NOW, not at the next boundary
    //    (past cycles stay frozen for calibration). Each row keeps a target
    //    matching its OWN duration (a still-running fortnight stays ×2 even
    //    if the pref moved to weekly). Idempotent: the next reconcile
    //    recomputes the same targets and writes nothing.
    for (const row of [current, ...upcoming]) {
      const rowWeeks = Math.max(1, Math.round(diffDays(row.start_date, row.end_date) / 7));
      const rowTarget = computeTargetPoints(prefs.intensity, factor, rowWeeks);
      if (row.intensity === prefs.intensity && row.target_points === rowTarget) continue;
      await service
        .from("cycles")
        .update({ intensity: prefs.intensity, target_points: rowTarget })
        .eq("id", row.id);
      row.intensity = prefs.intensity;
      row.target_points = rowTarget;
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
      .is("projects.deleted_at", null)
      .is("deleted_at", null),
    service
      .from("issues")
      .select("effort, status")
      .eq("cycle_id", cycle.id)
      .is("deleted_at", null),
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
    // Un bloqueur corbeillé ne bloque plus : absent de `statusById`, il est lu
    // comme « pas bloquant » par isBlockedIn (lib/cycle.ts), ce qu'on veut.
    const { data: blockerRows } = await service
      .from("issues")
      .select("id, status")
      .in("id", blockerIds)
      .is("deleted_at", null);
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
    .is("deleted_at", null)
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

  // Touch the cycle row: issue writes only broadcast on project topics, which
  // the /all board doesn't subscribe to — this UPDATE rides the user topic and
  // tells the open board to refetch (a Numo fill becomes visible live).
  if (pickedIds.length > 0) {
    await service
      .from("cycles")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", cycle.id);
  }

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

export interface CycleIssueSummary {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  effort: string | null;
  project_id: string;
}

export interface CycleOverview {
  which: "current" | "next" | "previous";
  cycle: CycleInfo & {
    filled_points: number;
    completion_percent: number | null;
  };
  issues: CycleIssueSummary[];
  /** Best next candidates from the user's assigned pool, reco-ordered (≤10). */
  candidates: Array<CycleIssueSummary & { blocked: boolean; points: number }>;
}

/**
 * One cycle with its content and the reco-ordered pool — the shared read
 * behind Numo's get_cycle and the MCP's minddy_get_cycle (agent parity by
 * construction). Runs ensureCycles first, so reading also reconciles.
 */
export async function getCycleOverview({
  service,
  userId,
  prefs,
  which = "current",
}: {
  service: SupabaseClient;
  userId: string;
  prefs: CyclePrefs;
  which?: "current" | "next" | "previous";
}): Promise<{ ok: true; overview: CycleOverview } | { ok: false; error: string }> {
  const ensured = await ensureCycles({ service, userId, prefs, today: todayISO() });
  const cycle =
    which === "next"
      ? (ensured.upcoming[0] ?? null)
      : which === "previous"
        ? (ensured.past[0] ?? null)
        : ensured.current;
  if (!cycle) return { ok: false, error: `No ${which} cycle exists.` };

  const { data: issueRows } = await service
    .from("issues")
    .select("id, project_id, number, title, status, priority, effort, projects(key)")
    .eq("cycle_id", cycle.id)
    .is("deleted_at", null)
    .order("number", { ascending: true });
  const issues: CycleIssueSummary[] = (issueRows ?? []).map((row) => ({
    id: row.id as string,
    identifier: issueIdentifier(
      ((row.projects as { key?: string } | null)?.key ?? "").toString(),
      row.number as number
    ),
    title: (row.title as string) ?? "",
    status: row.status as string,
    priority: row.priority as string,
    effort: (row.effort as string | null) ?? null,
    project_id: row.project_id as string,
  }));
  const pointed = issues.map((i) => ({
    effort: (i.effort as RecoIssue["effort"]) ?? null,
    status: i.status as IssueStatus,
  }));

  // Best next candidates: the user's assigned, uncycled, open-status pool,
  // reco-scored with `blocks` precedence.
  const { data: poolRows } = await service
    .from("issues")
    .select(
      "id, project_id, number, title, status, priority, effort, issue_categories(category_id), projects!inner(key, deleted_at)"
    )
    .eq("assignee_id", userId)
    .is("cycle_id", null)
    .in("status", CYCLE_OPEN_STATUSES as string[])
    .is("projects.deleted_at", null)
    .is("deleted_at", null);
  const pool = (poolRows ?? []).map((row) => ({
    id: row.id as string,
    project_id: row.project_id as string,
    title: (row.title as string) ?? "",
    status: row.status as IssueStatus,
    priority: row.priority as RecoIssue["priority"],
    effort: (row.effort as RecoIssue["effort"]) ?? null,
    category_ids: ((row.issue_categories ?? []) as { category_id: string }[]).map(
      (c) => c.category_id
    ),
    number: row.number as number,
    key: ((row.projects as { key?: string } | null)?.key ?? "").toString(),
  }));
  const { data: relationRows } = pool.length
    ? await service
        .from("issue_relations")
        .select("id, source_id, target_id, type")
        .eq("type", "blocks")
        .in(
          "target_id",
          pool.map((c) => c.id)
        )
    : { data: [] };
  const statusById = new Map<string, IssueStatus>(pool.map((c) => [c.id, c.status]));
  const blocked = blockedSet(
    pool.map((c) => c.id),
    (relationRows ?? []) as IssueRelation[],
    statusById
  );
  const candidates = pool
    .map((c) => ({ c, score: recoScore(c, blocked.has(c.id)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ c }) => ({
      id: c.id,
      identifier: issueIdentifier(c.key, c.number),
      title: c.title,
      status: c.status as string,
      priority: c.priority as string,
      effort: (c.effort as string | null) ?? null,
      project_id: c.project_id,
      blocked: blocked.has(c.id),
      points: effortToPoints(c.effort),
    }));

  return {
    ok: true,
    overview: {
      which,
      cycle: {
        ...toCycleInfo(cycle),
        filled_points: cycleFilledPoints(pointed),
        completion_percent: cycleCompletionPercent(pointed),
      },
      issues,
      candidates,
    },
  };
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
    .is("deleted_at", null)
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
    .is("deleted_at", null)
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

  // Same user-topic nudge as the fill: the capture lands after the response,
  // so an open board only sees it through this broadcast.
  await service
    .from("cycles")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", current.id);
}

export interface CycleBlockerPullParams {
  /** Stored `blocks` edge: source blocks target. */
  blockerId: string;
  blockedId: string;
  /** Who created the relation — the pull is attributed to them. */
  actorId: string;
  viaAssistant?: boolean;
  mcpKeyId?: string | null;
}

/**
 * A `blocks` relation landed AFTER the cycle was planned (fire-and-forget,
 * pattern of scheduleCycleCapture): if the BLOCKED issue sits in its owner's
 * current cycle while the BLOCKER doesn't, the plan is incoherent — "pas B
 * sans A". Pull the blocker in (assign side-effect, never a status bump) and,
 * if that overshoots the capacity target, make room by evicting the
 * lowest-reco UNSTARTED issues only: in_progress / in_review / done never
 * leave a cycle on rebalancing. Re-checks everything at execution time.
 */
export function scheduleCycleBlockerPull(params: CycleBlockerPullParams): void {
  after(() =>
    runCycleBlockerPull(params).catch((e) =>
      console.error("[cycles] blocker pull failed:", (e as Error).message)
    )
  );
}

export async function runCycleBlockerPull(params: CycleBlockerPullParams): Promise<void> {
  const service = getServiceClient();

  // The blocked issue must sit in a cycle…
  const { data: blocked } = await service
    .from("issues")
    .select("id, cycle_id, status")
    .eq("id", params.blockedId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!blocked?.cycle_id) return;

  // …and that cycle must be its owner's CURRENT one (past cycles are frozen
  // history; a future cycle gets refilled at its own boundary anyway).
  const { data: cycleRow } = await service
    .from("cycles")
    .select(CYCLE_SELECT)
    .eq("id", blocked.cycle_id)
    .maybeSingle();
  if (!cycleRow) return;
  const cycle = cycleRow as CycleRow;
  const today = todayISO();
  if (!(cycle.start_date <= today && today < cycle.end_date)) return;

  // The blocker must be pullable: real living work, not already planned in a
  // cycle, and not someone else's assignment (their plan, not this one —
  // pulling it here would steal it via a mere relation).
  const { data: blocker } = await service
    .from("issues")
    .select("id, cycle_id, status, assignee_id, project_id")
    .eq("id", params.blockerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!blocker || blocker.cycle_id !== null) return;
  if (!CYCLE_OPEN_STATUSES.includes(blocker.status as IssueStatus)) return;
  if (blocker.assignee_id && blocker.assignee_id !== cycle.user_id) return;

  // Pull it in (CAS on "still uncycled"), assigning to the owner — the same
  // side-effect as every add-to-cycle path; the SQL trigger keeps it honest.
  const { data: claimed } = await service
    .from("issues")
    .update({ cycle_id: cycle.id, assignee_id: cycle.user_id })
    .eq("id", params.blockerId)
    .is("cycle_id", null)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  const pullEvents: EventRow[] = [
    {
      issue_id: params.blockerId,
      actor_id: params.actorId,
      type: "updated",
      field: "cycle_id",
      from_value: null,
      to_value: cycle.id,
      via_assistant: params.viaAssistant || undefined,
    },
  ];
  if (blocker.assignee_id !== cycle.user_id) {
    pullEvents.push({
      issue_id: params.blockerId,
      actor_id: params.actorId,
      type: "updated",
      field: "assignee_id",
      from_value: (blocker.assignee_id as string) ?? null,
      to_value: cycle.user_id,
      via_assistant: params.viaAssistant || undefined,
    });
  }
  await insertEvents(service, pullEvents);

  // Rebalance: if the pull overshot the target, evict the lowest-reco
  // unstarted issues (never the blocker/blocked pair, never started work).
  const { data: cycleIssueRows } = await service
    .from("issues")
    .select("id, project_id, title, status, priority, effort, issue_categories(category_id)")
    .eq("cycle_id", cycle.id)
    .is("deleted_at", null);
  const cycleIssues: RecoIssue[] = (cycleIssueRows ?? []).map((row) => ({
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
  const filled = cycleFilledPoints(cycleIssues);
  const excess = filled - cycle.target_points;
  if (excess > 0) {
    const candidates = cycleIssues.filter(
      (i) =>
        (i.status === "backlog" || i.status === "todo") &&
        i.id !== params.blockerId &&
        i.id !== params.blockedId
    );
    const { data: relationRows } = candidates.length
      ? await service
          .from("issue_relations")
          .select("id, source_id, target_id, type")
          .eq("type", "blocks")
          .in(
            "target_id",
            candidates.map((c) => c.id)
          )
      : { data: [] };
    const statusById = new Map<string, IssueStatus>(
      cycleIssues.map((i) => [i.id, i.status])
    );
    const evicted = pickEvictions({
      candidates,
      relations: (relationRows ?? []) as IssueRelation[],
      statusById,
      excessPoints: excess,
    });
    if (evicted.length > 0) {
      // CAS guards: an issue started or moved meanwhile stays put.
      const { data: removedRows } = await service
        .from("issues")
        .update({ cycle_id: null })
        .in("id", evicted)
        .eq("cycle_id", cycle.id)
        .in("status", ["backlog", "todo"])
        .select("id");
      await insertEvents(
        service,
        (removedRows ?? []).map((row) => ({
          issue_id: row.id as string,
          actor_id: params.actorId,
          type: "updated",
          field: "cycle_id",
          from_value: cycle.id,
          to_value: null,
          via_assistant: params.viaAssistant || undefined,
        }))
      );
    }
  }

  // One user-topic nudge for the whole rebalance (pull + evictions).
  await service
    .from("cycles")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", cycle.id);
}

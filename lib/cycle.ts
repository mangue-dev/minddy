import type { IssueEffort, IssuePriority, IssueStatus } from "./issue-constants";
import type { IssueRelation } from "./types";
import type { CycleIntensity } from "./cycle-prefs";

// The deterministic Cycles engine (MIN-32) — dates, capacity points and the
// fill/reco scoring, in one pure module (the lib/plan.ts pattern): no React,
// no "server-only", no I/O, so the board UI (column ordering, capacity ring)
// and the server cores (window creation, rollover, auto-fill, Numo's
// fill_cycle) share the exact same arithmetic.
//
// Conventions:
//   - Calendar dates are plain "YYYY-MM-DD" strings; the math runs on
//     Date.UTC so it is immune to DST and the host timezone.
//   - A cycle window is [start_date, end_date) — end EXCLUSIVE.
//   - Capacity is in hidden Fibonacci points (xs1 s2 m3 l5 xl8) — the UI only
//     ever shows a percentage of the target, never raw counts.

// ── Dates ────────────────────────────────────────────────────────────────────

export interface CycleWindow {
  start_date: string;
  /** Exclusive — equals the next window's start_date. */
  end_date: string;
}

const DAY_MS = 86_400_000;

const toUTC = (date: string): number => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

const fromUTC = (ms: number): string => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** The user's calendar date, in their own timezone. */
export function todayISO(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(date: string, days: number): string {
  return fromUTC(toUTC(date) + days * DAY_MS);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

/** ISO day of week: 1 = Monday … 7 = Sunday. */
export function isoDow(date: string): number {
  return ((new Date(toUTC(date)).getUTCDay() + 6) % 7) + 1;
}

// 1970-01-05 is a Monday. Anchoring every cadence on this epoch week keeps a
// fortnight's parity stable: re-deriving windows after a prefs edit lands on
// the same boundaries, instead of shifting everyone's cycle by a week.
const EPOCH_MONDAY = "1970-01-05";

export interface CycleCadence {
  /** ISO day of week the cycle starts on (1 = Monday … 7 = Sunday). */
  startDow: number;
  durationWeeks: 1 | 2;
}

/** Start of the window containing `date` for the given cadence. */
export function cycleStartOf(date: string, cadence: CycleCadence): string {
  const anchor = addDays(EPOCH_MONDAY, cadence.startDow - 1);
  const periodDays = cadence.durationWeeks * 7;
  const elapsed = diffDays(anchor, date);
  return addDays(anchor, Math.floor(elapsed / periodDays) * periodDays);
}

/** The window containing `today`, then `upcoming` windows after it. */
export function cycleWindows(
  cadence: CycleCadence,
  today: string,
  upcoming: number
): CycleWindow[] {
  const periodDays = cadence.durationWeeks * 7;
  const first = cycleStartOf(today, cadence);
  return Array.from({ length: upcoming + 1 }, (_, i) => {
    const start = addDays(first, i * periodDays);
    return { start_date: start, end_date: addDays(start, periodDays) };
  });
}

export function cyclePhase(
  window: CycleWindow,
  today: string
): "past" | "current" | "future" {
  if (window.end_date <= today) return "past";
  if (window.start_date > today) return "future";
  return "current";
}

// ── Statuses ─────────────────────────────────────────────────────────────────

/**
 * Triage is work not yet decided; a cycle is the commitment to do it now — the
 * two can't overlap. THE triage/cycle invariant, enforced on every write path:
 * an issue moved to triage LEAVES its cycle (SQL trigger `enforce_issue_cycle`,
 * mirrored in updateIssueFields so the activity event and the realtime nudge
 * are honest), and a triage issue can never be added to one.
 */
export function statusAllowsCycle(status: IssueStatus): boolean {
  return status !== "triage";
}

/** The same invariant, for an optimistic client patch: whether this status
 *  change takes the issue OUT of its cycle. Mirroring the server side-effect
 *  locally is what makes the card leave the cycle board at once — and what
 *  puts the cycle back on ⌘Z (the undo snapshot diffs the patch's keys). */
export function leavesCycleOnStatus(
  issue: { cycle_id: string | null } | undefined,
  nextStatus: IssueStatus | undefined
): boolean {
  return !!issue?.cycle_id && nextStatus !== undefined && !statusAllowsCycle(nextStatus);
}

// ── Points ───────────────────────────────────────────────────────────────────

/** T-shirt effort → Fibonacci points. Hidden from the UI (3 XL ≠ 3 XS). */
export const EFFORT_POINTS: Record<IssueEffort, number> = {
  xs: 1,
  s: 2,
  m: 3,
  l: 5,
  xl: 8,
};

/** An unsized issue counts as a medium — the neutral middle of the scale. */
export const DEFAULT_EFFORT_POINTS = EFFORT_POINTS.m;

export function effortToPoints(effort: IssueEffort | null | undefined): number {
  return effort ? EFFORT_POINTS[effort] : DEFAULT_EFFORT_POINTS;
}

/** Intensity is a per-user pace preference, not a per-cycle knob. The bases
    are PER WEEK — a fortnight cycle targets twice as much — and sized for
    AI-assisted throughput (a "heavy" solo week ships a lot of small issues);
    the calibration factor stretches them further, up to 3×. */
export const INTENSITY_BASE_POINTS: Record<CycleIntensity, number> = {
  light: 40,
  medium: 80,
  heavy: 120,
};

/** A closed cycle's calibration signal: what got done, at which pace setting,
    over how many weeks. */
export interface CalibrationSample {
  completed: number;
  intensity: CycleIntensity;
  /** The cycle's length in weeks (default 1) — a fortnight completing 2× the
      weekly base is pace 1, not pace 2. */
  weeks?: number;
}

/**
 * Personal velocity factor relative to the default scale. Each closed cycle
 * contributes `completed ÷ (weekly base of its intensity × its weeks)` —
 * normalizing by base and duration makes samples from different intensity
 * levels and cadences comparable — and the factor is the mean of the most
 * recent (≤3). One factor scales ALL three levels (light/medium/heavy stay
 * 0.5×/1×/1.5× of the same unit), so a calibrated medium can grow past the
 * heavy DEFAULT while heavy grows with it — the levels can never cross. No
 * ceiling at the default: a consistently faster week yields a genuinely
 * bigger target. Clamped to [0.5, 3] only to absorb outliers; 1 (the
 * defaults) with fewer than 2 samples.
 */
export function calibrationFactor(samples: CalibrationSample[]): number {
  if (samples.length < 2) return 1;
  const recent = samples.slice(0, 3);
  const mean =
    recent.reduce(
      (sum, s) =>
        sum + s.completed / (INTENSITY_BASE_POINTS[s.intensity] * (s.weeks ?? 1)),
      0
    ) / recent.length;
  return Math.min(3, Math.max(0.5, mean));
}

/** Capacity target for a cycle: the intensity's WEEKLY base scaled by the
    user's calibrated velocity factor and the cycle's duration. */
export function computeTargetPoints(
  intensity: CycleIntensity,
  factor: number,
  durationWeeks: number = 1
): number {
  return Math.max(1, Math.round(INTENSITY_BASE_POINTS[intensity] * factor * durationWeeks));
}

const CLOSED_STATUSES: readonly IssueStatus[] = ["done", "canceled", "duplicate"];
const isClosed = (status: IssueStatus) => CLOSED_STATUSES.includes(status);

type PointedIssue = { effort: IssueEffort | null; status: IssueStatus };

/** Points currently occupying a cycle (canceled/duplicate don't count). */
export function cycleFilledPoints(issues: PointedIssue[]): number {
  return issues.reduce(
    (sum, i) =>
      i.status === "canceled" || i.status === "duplicate"
        ? sum
        : sum + effortToPoints(i.effort),
    0
  );
}

/** Points actually finished — the calibration signal snapshotted at close. */
export function cycleCompletedPoints(issues: PointedIssue[]): number {
  return issues.reduce(
    (sum, i) => (i.status === "done" ? sum + effortToPoints(i.effort) : sum),
    0
  );
}

// Partial completion credit per open status: started work is worth a sliver
// (10%), reviewed work half — the rest lands with "done".
const COMPLETION_CREDIT: Partial<Record<IssueStatus, number>> = {
  in_progress: 0.1,
  in_review: 0.5,
};

/** Completion credit for one issue's status, in [0, 1]: fully counted once
    closed (done / canceled / duplicate = dealt with), a partial sliver while in
    flight (in_progress 10%, in_review 50%), nothing when unstarted. Shared by
    the cycle's progression ring and the objectives' progress bar so both grade
    completion the same way. */
export function statusCompletionCredit(status: IssueStatus): number {
  if (isClosed(status)) return 1;
  return COMPLETION_CREDIT[status] ?? 0;
}

/** Share of the cycle already dealt with: points of closed issues (done,
    canceled, duplicate) ÷ points of every issue in the cycle — with partial
    credit for work in flight (statusCompletionCredit). Weighted like everything
    else — never a raw issue count. Null when the cycle is empty. */
export function cycleCompletionPercent(issues: PointedIssue[]): number | null {
  let total = 0;
  let earned = 0;
  for (const i of issues) {
    const points = effortToPoints(i.effort);
    total += points;
    earned += points * statusCompletionCredit(i.status);
  }
  return total === 0 ? null : Math.round((earned / total) * 100);
}

// ── Reco scoring & fill ──────────────────────────────────────────────────────

/**
 * Steering weights for the deterministic engine. All optional; Numo derives
 * them from a phrase ("priorise les fixs UI") — they bias the scoring, they
 * never force a pick.
 */
export interface FillWeights {
  priority?: number;
  unblocked?: number;
  small?: number;
  projectBoost?: Record<string, number>;
  categoryBoost?: Record<string, number>;
  keywordBoost?: { keyword: string; weight: number }[];
}

/** The issue fields the scoring needs — Issue satisfies it. */
export type RecoIssue = {
  id: string;
  project_id: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  effort: IssueEffort | null;
  category_ids: string[];
};

const PRIORITY_RANK: Record<IssuePriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

/** target id → ids of the issues blocking it, from stored `blocks` edges. */
function blockersIndex(relations: IssueRelation[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const r of relations) {
    if (r.type !== "blocks") continue;
    const list = index.get(r.target_id);
    if (list) list.push(r.source_id);
    else index.set(r.target_id, [r.source_id]);
  }
  return index;
}

/** Whether `id` has at least one blocker that is neither closed nor in `allow`
 *  (an unknown blocker status is treated as non-blocking). */
function isBlockedIn(
  index: Map<string, string[]>,
  id: string,
  statusById: Map<string, IssueStatus>,
  allow?: Set<string>
): boolean {
  const blockers = index.get(id);
  if (!blockers) return false;
  return blockers.some((b) => {
    if (allow?.has(b)) return false;
    const status = statusById.get(b);
    return status !== undefined && !isClosed(status);
  });
}

/** Ids among `ids` that are blocked by an open issue ("pas B sans A"). */
export function blockedSet(
  ids: Iterable<string>,
  relations: IssueRelation[],
  statusById: Map<string, IssueStatus>
): Set<string> {
  const index = blockersIndex(relations);
  const out = new Set<string>();
  for (const id of ids) {
    if (isBlockedIn(index, id, statusById)) out.add(id);
  }
  return out;
}

/** The reco score: priority first, unblocked next, small first — plus the
 *  optional steering boosts. Higher = do sooner. */
export function recoScore(
  issue: RecoIssue,
  blocked: boolean,
  weights?: FillWeights
): number {
  const w = { priority: 1, unblocked: 1, small: 1, ...weights };
  let score =
    PRIORITY_RANK[issue.priority] * 10 * w.priority +
    (blocked ? 0 : 5 * w.unblocked) +
    (EFFORT_POINTS.xl - effortToPoints(issue.effort)) * w.small;
  score += w.projectBoost?.[issue.project_id] ?? 0;
  if (w.categoryBoost) {
    for (const id of issue.category_ids) score += w.categoryBoost[id] ?? 0;
  }
  if (w.keywordBoost) {
    const title = issue.title.toLowerCase();
    for (const { keyword, weight } of w.keywordBoost) {
      if (keyword && title.includes(keyword.toLowerCase())) score += weight;
    }
  }
  return score;
}

/**
 * Within-column order of the cycle board: reco score desc — the top of a
 * column is "do this next". The reco is the ONLY order (no manual sort).
 */
export function recoComparator(
  relations: IssueRelation[],
  statusById: Map<string, IssueStatus>,
  weights?: FillWeights
): (a: RecoIssue, b: RecoIssue) => number {
  const index = blockersIndex(relations);
  return (a, b) => {
    const scoreA = recoScore(a, isBlockedIn(index, a.id, statusById), weights);
    const scoreB = recoScore(b, isBlockedIn(index, b.id, statusById), weights);
    if (scoreA !== scoreB) return scoreB - scoreA;
    const pointsA = effortToPoints(a.effort);
    const pointsB = effortToPoints(b.effort);
    if (pointsA !== pointsB) return pointsA - pointsB;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

/**
 * Make room in an over-target cycle: pick the LOWEST-reco candidates to evict
 * until `excessPoints` are freed (or candidates run out — an honest overfull
 * cycle beats evicting started work). The caller pre-filters candidates to
 * unstarted issues only (backlog/todo): in_progress / in_review / done never
 * leave a cycle on rebalancing.
 */
export function pickEvictions(opts: {
  candidates: RecoIssue[];
  relations: IssueRelation[];
  statusById: Map<string, IssueStatus>;
  excessPoints: number;
}): string[] {
  const { candidates, relations, statusById } = opts;
  if (opts.excessPoints <= 0) return [];
  const worstFirst = [...candidates]
    .sort(recoComparator(relations, statusById))
    .reverse();
  const evicted: string[] = [];
  let freed = 0;
  for (const issue of worstFirst) {
    if (freed >= opts.excessPoints) break;
    evicted.push(issue.id);
    freed += effortToPoints(issue.effort);
  }
  // Partial is fine: evicted issues return to the pool (re-picked at the next
  // boundary), and getting closer to the target beats doing nothing.
  return evicted;
}

/**
 * Deterministic greedy fill: repeatedly pick the best-scored candidate that
 * (a) isn't blocked by an issue that is still open and not itself picked, and
 * (b) fits in the remaining capacity — undershoot beats overshoot. Fallback:
 * if nothing fit at all but eligible work exists, pick the single best one
 * (a week with one big thing beats an empty week). Same input → same output.
 */
export function fillCycle(opts: {
  candidates: RecoIssue[];
  relations: IssueRelation[];
  statusById: Map<string, IssueStatus>;
  targetPoints: number;
  alreadyFilledPoints?: number;
  weights?: FillWeights;
}): { picked: string[]; points: number } {
  const { candidates, relations, statusById, targetPoints, weights } = opts;
  const index = blockersIndex(relations);
  const picked = new Set<string>();
  const pool = new Map(candidates.map((c) => [c.id, c]));
  let points = 0;
  let remaining = targetPoints - (opts.alreadyFilledPoints ?? 0);

  const compare = (a: RecoIssue, b: RecoIssue) => {
    // Blocked-ness is pick-aware: picking A unblocks B within the same fill.
    const scoreA = recoScore(a, isBlockedIn(index, a.id, statusById, picked), weights);
    const scoreB = recoScore(b, isBlockedIn(index, b.id, statusById, picked), weights);
    if (scoreA !== scoreB) return scoreB - scoreA;
    const pointsA = effortToPoints(a.effort);
    const pointsB = effortToPoints(b.effort);
    if (pointsA !== pointsB) return pointsA - pointsB;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };

  while (remaining > 0 && pool.size > 0) {
    const eligible = [...pool.values()]
      .filter((c) => !isBlockedIn(index, c.id, statusById, picked))
      .sort(compare);
    const next = eligible.find((c) => effortToPoints(c.effort) <= remaining);
    if (!next) {
      // Nothing fits. If the cycle would stay empty, take the best eligible
      // anyway rather than leaving the user with no plan for the week.
      const cycleIsEmpty = picked.size === 0 && (opts.alreadyFilledPoints ?? 0) === 0;
      const fallback = cycleIsEmpty ? eligible[0] : undefined;
      if (!fallback) break;
      picked.add(fallback.id);
      points += effortToPoints(fallback.effort);
      break;
    }
    picked.add(next.id);
    pool.delete(next.id);
    const cost = effortToPoints(next.effort);
    points += cost;
    remaining -= cost;
  }

  return { picked: [...picked], points };
}

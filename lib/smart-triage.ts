import type { IssueEffort, IssuePriority, IssueStatus } from "@/lib/issue-constants";
import { isClosedStatus } from "@/lib/issue-constants";
import { calendarDaysBetween } from "@/lib/due-date";
import type { Issue, IssueRelation, ViewSort } from "@/lib/types";
import { dueBoost, issueComparator, PRIORITY_ORDER } from "@/lib/view-filter";
import { triageScoreComparator } from "@/lib/triage-score-order";

/**
 * Smart Triage (MIN-566) — the on-demand reorder of a board column, ALWAYS
 * available; the project only chooses the engine (MIN-575: no "off" mode —
 * a switch that says "disabled" while the smart view sort keeps reordering
 * by rules is a lie). The mode lives on the project row
 * (`smart_triage_mode`), never on a platform switch (MIN-557):
 *
 * - `rules` — the static rules (Phase A): relations decide first (a ticket that
 *   blocks open work on top, a blocked ticket at the bottom), then the
 *   quick wins (low effort buys back priority tiers), objective tickets kept
 *   together, due dates and age as tie-breaks. Free, deterministic, testable.
 * - `jev` — Phase B: one decision-layer scoring pass per column (System One
 *   first, the LLM scoring pass as fallback) replaces the rules RANKING with a
 *   per-ticket urgency score; everything else stays identical. Named "AI" in
 *   the interface — the engine's name is an internal detail.
 *
 * Either way the reorder is a gesture: someone clicks "Smart triage", the
 * server rewrites the column's positions, and the manual drag order remains
 * fully editable afterwards. No background pass, no hidden automation.
 *
 * This module is the PURE half (shared client/server): the mode vocabulary and
 * the orderings. The orchestration (fetch, decisions, writes) lives in
 * `lib/server/smart-triage.ts`.
 */

export const SMART_TRIAGE_MODES = ["rules", "jev"] as const;

export type SmartTriageMode = (typeof SMART_TRIAGE_MODES)[number];

/** The mode of every project that has not chosen: rules — the free engine,
 * never the AI pass by accident. */
export const DEFAULT_SMART_TRIAGE_MODE: SmartTriageMode = "rules";

/** `null` on anything but the two known values — a bad payload is refused,
 * never coerced into a mode that runs AI where none was asked. The retired
 * `off` value reads as `null` too: read sites fall back to the default, so a
 * row that predates MIN-575 keeps working. */
export function parseSmartTriageMode(value: unknown): SmartTriageMode | null {
  return (SMART_TRIAGE_MODES as readonly unknown[]).includes(value)
    ? (value as SmartTriageMode)
    : null;
}

/**
 * The board's per-column comparator factory (MIN-576) — the ONE ordering the
 * Smart view sort reads, whichever engine the project's mode named:
 *
 * - `smart` — the FULL triage rules per column (`triageIssueComparator`:
 *   relations tier first, quick wins, objectives kept together — the same
 *   rules the server's reorder applies, so the two orders can never drift);
 *   with AI scores in the context, a presence-based hybrid rides on top:
 *   the tickets a scoring pass ranked compare by score among themselves,
 *   the others (a failed column, the capped tail) keep the rules ranking
 *   among themselves, and a ranked ticket outranks an unranked one.
 * - any other sort — the view sort's own comparator, column-blind.
 *
 * Per COLUMN because the rules group objectives over the column's own issue
 * set — one global comparator would tear an objective across statuses.
 */
export function boardComparatorFactory(
  sort: ViewSort,
  ctx: {
    relations?: IssueRelation[];
    statusById?: Map<string, IssueStatus>;
    now?: number;
    jevScores?: Map<string, number | null>;
  }
): (columnIssues: Issue[]) => (a: Issue, b: Issue) => number {
  if (sort !== "smart") {
    const comparator = issueComparator(sort, ctx);
    return () => comparator;
  }
  const scores = ctx.jevScores;
  const scored = scores ? triageScoreComparator(scores) : null;
  return (columnIssues) => {
    const rules = triageIssueComparator({
      issues: columnIssues,
      relations: ctx.relations,
      statusById: ctx.statusById,
      now: ctx.now,
    });
    if (!scored) return rules;
    return (a, b) => {
      const aScore = scores?.get(a.id);
      const bScore = scores?.get(b.id);
      if (aScore != null && bScore != null) return scored(a, b);
      if (aScore == null && bScore == null) return rules(a, b);
      // Mixed pair: the ranked ticket first — the AI put it there.
      return aScore != null ? -1 : 1;
    };
  };
}

/** One position the server rewrote — applied optimistically by the client. */
export interface SmartTriageMove {
  id: string;
  position: number;
}

/** The lean ticket shape the orderings read — a full `Issue` satisfies it. */
export interface TriageIssue {
  id: string;
  priority: IssuePriority;
  effort: IssueEffort | null;
  due_date: string | null;
  created_at: string;
  position: number;
  objective_id: string | null;
}

/**
 * The rules ordering of ONE column — pure, so the button's result is exactly
 * what the tests pin:
 *
 * 1. **Relations pass above everything.** A ticket that blocks at least one
 *    open ticket rises to the top tier; a ticket blocked by at least one open
 *    ticket sinks to the bottom tier (working on it now would stall on the
 *    blocker). A closed end changes nothing: a done blocker no longer blocks,
 *    and a blocker whose targets all closed stops earning its lift — the same
 *    semantics the "smart" view sort already applies.
 * 2. **Quick wins inside a tier.** Priority minus the effort discount (xs
 *    buys back more than xl costs), minus the due-date lift (overdue and
 *    imminent dates read as urgent). Same PRIORITY_ORDER as the view sort.
 * 3. **Objectives stay together.** Within each tier, tickets sharing an
 *    objective form a contiguous block ordered by the block's best ticket;
 *    ungrouped tickets are blocks of one.
 * 4. **Ties read the due date, then age (oldest first — how long a ticket
 *    has waited), then the manual position** (so a stable order survives a
 *    triage that changed nothing).
 */
export interface TriageContext {
  /** The column's tickets — the set the objective blocks are computed over. */
  issues: TriageIssue[];
  /** Stored relation rows — "blocks" edges only; "related" informs, never orders. */
  relations?: IssueRelation[];
  /** Issue id → status: a closed target is no longer blocked, a resolved
      blocker no longer earns its lift. Resolved against ALL issues (the other
      end may be outside the visible column). */
  statusById?: Map<string, IssueStatus>;
  /** Frozen "now", for the due lifts and the age tie-break — stable across a
      whole triage. Defaults to Date.now() at comparator creation. */
  now?: number;
}

/** How much effort a quick win buys back (in PRIORITY_ORDER tiers): xs beats
    s beats m; l and xl cost priority — the point of the mode is to surface the
    cheap-and-important first. No effort declared = no discount, no penalty. */
const EFFORT_QUICK_WIN: Record<IssueEffort, number> = {
  xs: 1.5,
  s: 1,
  m: 0.5,
  l: 0,
  xl: -0.5,
};

/** The quick-win rank of one ticket: PRIORITY_ORDER units, lower = sooner. */
function quickWinRank(issue: TriageIssue, now: number): number {
  const priority = PRIORITY_ORDER[issue.priority] ?? PRIORITY_ORDER.none;
  const effort = issue.effort ? (EFFORT_QUICK_WIN[issue.effort] ?? 0) : 0;
  return priority - effort - dueBoost(issue.due_date, now);
}

/** A "blocks" edge is ACTIVE when both ends are known-open — an edge whose
    ends are unseen (statuses never fetched) reads as open, not as noise: the
    rules would rather over-lift than silently ignore a dependency. */
function edgeActive(
  sourceId: string,
  targetId: string,
  statusById: Map<string, IssueStatus> | undefined
): boolean {
  if (!statusById) return true;
  const source = statusById.get(sourceId);
  if (source !== undefined && isClosedStatus(source)) return false;
  const target = statusById.get(targetId);
  if (target !== undefined && isClosedStatus(target)) return false;
  return true;
}

/** Ids of the open tickets that still block at least one open ticket. */
function activeBlockers(
  relations: IssueRelation[] | undefined,
  statusById: Map<string, IssueStatus> | undefined
): Set<string> {
  const ids = new Set<string>();
  if (!relations?.length) return ids;
  for (const r of relations) {
    if (r.type !== "blocks") continue;
    if (edgeActive(r.source_id, r.target_id, statusById)) ids.add(r.source_id);
  }
  return ids;
}

/** Ids of the open tickets held back by at least one open blocker. */
function activelyBlocked(
  relations: IssueRelation[] | undefined,
  statusById: Map<string, IssueStatus> | undefined
): Set<string> {
  const ids = new Set<string>();
  if (!relations?.length) return ids;
  for (const r of relations) {
    if (r.type !== "blocks") continue;
    if (edgeActive(r.source_id, r.target_id, statusById)) ids.add(r.target_id);
  }
  return ids;
}

/** Sooner due date first, undated last — the tie-break under equal ranks. */
function dueTiebreak(a: TriageIssue, b: TriageIssue): number {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date.localeCompare(b.due_date);
}

export function triageIssueComparator(
  ctx: TriageContext
): (a: TriageIssue, b: TriageIssue) => number {
  const now = ctx.now ?? Date.now();
  const { issues } = ctx;
  const blockers = activeBlockers(ctx.relations, ctx.statusById);
  const blocked = activelyBlocked(ctx.relations, ctx.statusById);
  const tierOf = (id: string): 0 | 1 | 2 =>
    blockers.has(id) ? 0 : blocked.has(id) ? 2 : 1;
  const rank = new Map<string, number>();
  for (const issue of issues) rank.set(issue.id, quickWinRank(issue, now));

  // Objective blocks, per tier: key = objective id (or the ticket's own id
  // when ungrouped). Each group's rank is its BEST member's — the block is
  // judged by its most urgent ticket, never dragged down by a late one.
  const groups = new Map<
    string,
    { tier: 0 | 1 | 2; best: number; members: TriageIssue[] }
  >();
  for (const issue of issues) {
    const tier = tierOf(issue.id);
    const key = `${tier}:${issue.objective_id ?? `solo:${issue.id}`}`;
    let group = groups.get(key);
    if (!group) {
      group = { tier, best: Number.POSITIVE_INFINITY, members: [] };
      groups.set(key, group);
    }
    const r = rank.get(issue.id) ?? 0;
    group.best = Math.min(group.best, r);
    group.members.push(issue);
  }

  // The group tie-break compares BLOCKS as wholes — best rank first, then
  // the block's most imminent due date, then its oldest member. Comparing
  // members individually here would let two tied blocks interleave and tear
  // an objective apart.
  const groupList = [...groups.values()].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.best !== b.best) return a.best - b.best;
    return blockTiebreak(a.members, b.members, now);
  });

  // Members inside a block: the full tie-break chain, then the id so the
  // order is total. The final order index makes the comparator itself
  // trivial — and guarantees contiguity by construction.
  const orderIndex = new Map<string, number>();
  let next = 0;
  for (const group of groupList) {
    const sorted = [...group.members].sort(
      (a, b) =>
        (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0) ||
        dueTiebreak(a, b) ||
        a.created_at.localeCompare(b.created_at) ||
        a.position - b.position ||
        (a.id < b.id ? -1 : 1)
    );
    for (const member of sorted) orderIndex.set(member.id, next++);
  }
  // An id the index never saw (a card projected into a drag preview) sorts
  // LAST — index 0 would put it at the top of the column it lands in.
  const unranked = orderIndex.size;
  return (a, b) =>
    (orderIndex.get(a.id) ?? unranked) - (orderIndex.get(b.id) ?? unranked);
}

/** The tie-break between two tied blocks: their best members compared on
    due date, age and position — the same chain the members use, read at the
    block level so a block never splits. */
function blockTiebreak(a: TriageIssue[], b: TriageIssue[], now: number): number {
  const best = (members: TriageIssue[]): TriageIssue =>
    members.reduce((current, candidate) => {
      const diff =
        (quickWinRank(candidate, now) - quickWinRank(current, now)) ||
        dueTiebreak(candidate, current) ||
        candidate.created_at.localeCompare(current.created_at) ||
        candidate.position - current.position;
      return diff < 0 ? candidate : current;
    });
  const aBest = best(a);
  const bBest = best(b);
  const dueDiff = dueTiebreak(aBest, bBest);
  if (dueDiff !== 0) return dueDiff;
  const ageDiff = aBest.created_at.localeCompare(bBest.created_at);
  if (ageDiff !== 0) return ageDiff;
  const positionDiff = aBest.position - bBest.position;
  if (positionDiff !== 0) return positionDiff;
  return aBest.id < bBest.id ? -1 : aBest.id > bBest.id ? 1 : 0;
}

/**
 * The Jev ordering of one column: the per-ticket urgency score (1–5) decides,
 * highest first; ties and unscored tickets (the LLM pass may answer only part
 * of the column) fold back on the age-then-position tie-break, never on a
 * guessed score. Pure — the orchestration hands it the answers whichever
 * engine produced them. The comparison itself lives in
 * `lib/triage-score-order.ts` (shared with the Smart view sort, MIN-576).
 */
export { TRIAGE_NEUTRAL_SCORE, triageScoreOrder as jevTriageOrder } from "./triage-score-order";

/** The urgency scale a triage decision asks for — shared by the state builder
    (prepare.ts) and the score consumers, so both engines answer the same
    vocabulary. Ordered lowest → highest. */
export const TRIAGE_SCORE_LEVELS = [
  { value: 1, label: "later" },
  { value: 2, label: "low" },
  { value: 3, label: "maybe" },
  { value: 4, label: "high" },
  { value: 5, label: "next" },
] as const;

/** One decision scores at most this many tickets: beyond, the column keeps its
    rules order for the tail. Bounds the state AND the LLM fallback's tool
    schema — a 200-card column would ask both engines for a 200-score answer. */
export const MAX_TRIAGE_TICKETS_PER_DECISION = 40;

/** Whole days a ticket has waited — the age the state paints. A
    creation in the future (clock skew, import) has waited zero. */
export function triageAgeDays(createdAt: string, now: number): number {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 0;
  return Math.max(0, Math.round(calendarDaysBetween(created, new Date(now))));
}

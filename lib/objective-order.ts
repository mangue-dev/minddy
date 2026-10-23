import type { ObjectiveStatus } from "./objective-validation";

/**
 * The order of objectives in every picker (MIN-785).
 *
 * Open objectives (planned, in progress) come before closed ones (done,
 * canceled). Inside each group, the objective that received the most tickets
 * recently comes first: "recently" means created during the last
 * `OBJECTIVE_RECENT_WINDOW_DAYS` days, whatever the ticket's status, so the
 * objectives the team is actively feeding rise to the top. Ties fall back to
 * the name, then the id, which makes the order total: the same objectives and
 * tickets always give the same list, whatever order they arrived in.
 */
export const OBJECTIVE_RECENT_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

type OrderableObjective = { id: string; name: string; status: ObjectiveStatus };
type CountableIssue = { objective_id: string | null; created_at: string };

export function isOpenObjectiveStatus(status: ObjectiveStatus): boolean {
  return status === "planned" || status === "in_progress";
}

/** Tickets created inside the window, counted per objective id. */
export function recentIssueCounts(
  issues: readonly CountableIssue[],
  now: number = Date.now()
): Map<string, number> {
  const since = now - OBJECTIVE_RECENT_WINDOW_DAYS * DAY_MS;
  const counts = new Map<string, number>();
  for (const issue of issues) {
    if (!issue.objective_id) continue;
    const created = Date.parse(issue.created_at);
    if (!Number.isFinite(created) || created < since) continue;
    counts.set(issue.objective_id, (counts.get(issue.objective_id) ?? 0) + 1);
  }
  return counts;
}

// A fixed locale keeps the tie-break identical on every client: the viewer's
// locale would order accented names differently from one browser to another.
const nameCollator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** A new array in picker order; the input is left untouched. */
export function orderObjectives<T extends OrderableObjective>(
  objectives: readonly T[],
  issues: readonly CountableIssue[],
  now: number = Date.now()
): T[] {
  const counts = recentIssueCounts(issues, now);
  return [...objectives].sort((a, b) => {
    const open = Number(isOpenObjectiveStatus(b.status)) - Number(isOpenObjectiveStatus(a.status));
    if (open !== 0) return open;
    const recent = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0);
    if (recent !== 0) return recent;
    return nameCollator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

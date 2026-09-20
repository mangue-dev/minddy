/**
 * The score-driven ordering of a triage (MIN-566, MIN-576) — the ONE home
 * for the "highest urgency first" comparison, shared by the server's
 * reorder and the board's Smart view sort. Deliberately dependency-free:
 * `lib/view-filter.ts` reads it (the comparator rides the view sort) while
 * `lib/smart-triage.ts` imports `view-filter`, so neither side can own the
 * code without an import cycle.
 */

/** The score an unscored ticket reads as — the middle of the 1–5 scale.
 * A ticket the engines never scored (a tail past the cap, a failed pass)
 * is "maybe", never a guess. */
export const TRIAGE_NEUTRAL_SCORE = 3;

/** The fields the comparison reads — a full `Issue` or `TriageIssueRow`
 * satisfies it. */
export interface ScoredIssue {
  id: string;
  created_at: string;
  position: number;
}

/**
 * Highest score first; ties and unscored tickets (a `null` or a missing
 * entry) fold back on the age-then-position tie-break, never on a guessed
 * score. Pure — the caller hands the scores whichever engine produced them.
 */
export function triageScoreComparator<T extends ScoredIssue>(
  scores: Map<string, number | null>
): (a: T, b: T) => number {
  return (a, b) => {
    const scoreA = scores.get(a.id) ?? TRIAGE_NEUTRAL_SCORE;
    const scoreB = scores.get(b.id) ?? TRIAGE_NEUTRAL_SCORE;
    const diff = scoreB - scoreA;
    if (diff !== 0) return diff;
    const ageDiff = a.created_at.localeCompare(b.created_at);
    if (ageDiff !== 0) return ageDiff;
    return a.position - b.position;
  };
}

/** The scored order of one column's issues, as a sorted copy. */
export function triageScoreOrder<T extends ScoredIssue>(
  issues: T[],
  scores: Map<string, number | null>
): T[] {
  return [...issues].sort(triageScoreComparator(scores));
}

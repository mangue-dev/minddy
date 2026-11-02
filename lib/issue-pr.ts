/**
 * The pull request for a ticket, as the cards and sign read it.
 *
 * It was read on Numo's runs — which made it invisible as soon as
 * no one had launched an agent (human PR, or PR attached to the hand), and as soon
 * that it was CLOSED. It now comes from `pull_requests`, all states
 * confused: “See the pull request” should lead to a closed PR as well as to a
 * other. The chip is silent on `closed` — the only state that calls for nothing
 * more.
 */
export interface IssuePr {
  /** Id minddy — `?pr=` opens the PR whatever its state (the page pins it). */
  prId: string;
  prNumber: number;
  state: "draft" | "open" | "merged" | "closed";
}

/** A PR still alive or delivered: everything but refused. */
export function isPrWorthShowing(pr: IssuePr | null): boolean {
  return !!pr && pr.state !== "closed";
}

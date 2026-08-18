/**
 * The rereading of a PR by Numo seen as an AGENT SESSION (MIN-168) — the
 * vocabulary shared between the server which launches it (`lib/server/agent/launch.ts`)
 * and the screen which displays it (`components/pull-requests/pr-review-thread.tsx`).
 *
 * PUR module: no server import, it crosses the border.
 *
 * What has disappeared compared to the old pass (`lib/pr-review-run.ts`): the
 * house event flow, its phases, its `finding`, its live. A replay
 * is now an agent run like any other — its flow is that of
 * `agent_run_events`, and it looks in the session, not in the PR thread.
 * All that's left here is what the PR thread needs: saying that the agent is working
 * or finished, and log in.
 */

export type PrReviewRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

/** The replay session, reduced to what the PR thread shows. */
export interface PrReviewRunSummary {
  runId: string;
  status: PrReviewRunStatus;
  /** The agent is WORKING (queued/running) — the server is slicing, not the screen. */
  working: boolean;
  model: string | null;
  createdAt: string;
  /** End of last response, or null until there was one. */
  completedAt: string | null;
}

/** Response from GET `./ai-review`: the session, and how to decide to restart one. */
export interface PrReviewSession {
  run: PrReviewRunSummary | null;
  /** SHA reread by the last TERMINATED session — compared to the current head:
 * as long as they are equal, restarting would repay a run for the same code. */
  reviewedHeadSha: string | null;
  model: {
    /** Default set in /admin: what “default” is worth in the picker. */
    instance: string;
    /** Dernier choix du compte, ou null s'il n'en a jamais fait. */
    preferred: string | null;
  };
}

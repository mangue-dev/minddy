/**
 * The time budget of one job running a Numo turn (MIN-1010).
 *
 * Every route that runs a turn is a function capped at `maxDuration = 300`.
 * A turn can outlive that: it hands itself to a new job at a durable boundary
 * (before a generation, or before a tool) when the time left would not cover
 * the next step. Nothing is ever cut in the middle of a provider call or a
 * tool, so a `reconcile` tool can no longer be killed half done.
 */

/** `maxDuration` of the routes that run Numo turns, in milliseconds. */
export const NUMO_JOB_DURATION_MS = 300_000;

/** Kept back at the end of a job to record the handoff and answer. */
export const NUMO_JOB_FINISH_RESERVE_MS = 15_000;

/**
 * The time a step needs before the job's deadline. A round of the weekly
 * routines averages about 16 s, but one generation may stream for well over a
 * minute, and an external MCP call has no timeout of its own.
 */
export const NUMO_STEP_RESERVE_MS = {
  generation: 105_000,
  tool: 90_000,
} as const;

export type NumoTurnStep = keyof typeof NUMO_STEP_RESERVE_MS;

/**
 * True when a turn can count on a new job to take it over: on Vercel, where
 * the function is killed at `maxDuration`, with `CRON_SECRET` set so the
 * relay and the minute clock can run the turn. A self-hosted server, or one
 * without its scheduler, keeps running the turn to the end in-process.
 */
export function numoTurnHandoffAvailable(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.VERCEL?.trim() && env.CRON_SECRET?.trim());
}

/** The instant past which a job started at `startedAt` must not be working. */
export function numoJobDeadline(startedAt: number = Date.now()): number {
  return startedAt + NUMO_JOB_DURATION_MS - NUMO_JOB_FINISH_RESERVE_MS;
}

/** True when the time left before `deadlineAt` does not cover `step`. */
export function numoTurnShouldHandOff(
  deadlineAt: number,
  step: NumoTurnStep,
  now: number = Date.now(),
): boolean {
  return deadlineAt - now < NUMO_STEP_RESERVE_MS[step];
}

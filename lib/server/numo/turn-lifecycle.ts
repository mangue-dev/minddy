import type { NumoTurnStatus } from "@/lib/assistant-types";

/**
 * Who moves a Numo turn out of each status, and how soon (MIN-1011). A turn
 * that is not terminal always has either a job working on it or a deadline
 * that moves it on its own: no status waits for a gesture nobody is asked to
 * make. `turn-lifecycle.test.ts` checks each entry against the recovery SQL
 * and the drain, so a new status cannot be added without its exit.
 *
 * `waiting_work` is gone: the code agent it waited for was removed (MIN-721)
 * and the status with it.
 */
export type NumoTurnExit =
  | { kind: "terminal" }
  | {
      kind: "automatic";
      /** Who moves it. */
      by: string;
      /** The longest it can stay there, in minutes, with the minute drain. */
      withinMinutes: number;
    }
  | {
      kind: "open";
      /** Why waiting is the right state, and what keeps it from blocking. */
      why: string;
    };

export const NUMO_TURN_EXITS: Record<NumoTurnStatus, NumoTurnExit> = {
  completed: { kind: "terminal" },
  failed: { kind: "terminal" },
  stopped: { kind: "terminal" },
  queued: {
    kind: "automatic",
    by: "the minute drain (`drainNumoTurns`) claims it once `not_before` passes",
    withinMinutes: 2,
  },
  retryable: {
    kind: "automatic",
    by: "the minute drain claims it; past its last attempt the claiming job ends it `failed`",
    withinMinutes: 2,
  },
  running: {
    kind: "automatic",
    by: "its job; a lease older than 6 minutes goes back to `retryable` (`recover_stale_numo_turns`)",
    withinMinutes: 8,
  },
  stopping: {
    kind: "automatic",
    by: "its job acknowledges the stop; a lease older than 6 minutes ends `stopped`",
    withinMinutes: 8,
  },
  reconciling: {
    kind: "automatic",
    by: "`recover_stale_numo_turns` returns it to `retryable`; the claim then settles the interrupted call",
    withinMinutes: 2,
  },
  waiting_input: {
    kind: "open",
    why: "an interactive question stays open without blocking the conversation (`begin_numo_turn` ignores it); a later turn ends it `completed`, and a routine run waiting 7 days ends `stopped`",
  },
};

/** The statuses the stuck-turn alert watches: those with a deadline. */
export const NUMO_TURN_STATUSES_WITH_DEADLINE = (Object.keys(NUMO_TURN_EXITS) as NumoTurnStatus[])
  .filter((status) => NUMO_TURN_EXITS[status].kind === "automatic");

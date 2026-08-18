import "server-only";

import { after } from "next/server";

/**
 * `after()` which does not RISE out of a request.
 *
 * The background work of minddy (Smart Assign, cycle capture, sync du
 * feedback, automations) are scheduled from `updateIssueFields`, and
 * `after()` requires a query context. As long as this writing core was
 * only called by routes, the question did not arise.
 *
 * MIN-147 changed it: the automation engine writes to the ticket from
 * a CASCADE — a chain whose step ends recalls another, outside
 * of any request — and by `launchAgentRun`, which aligns the status to the start
 * of a run. There, `after()` raises; and since it raises BEFORE the next hook, it
 * took with it everything that remained to be programmed, plus the writing itself.
 *
 * The fallback executes the work RIGHT AWAY rather than after the response: without a
 * query, there is no response to wait for. The callers' contract is
 * unchanged — excluding critical path, best-effort, never throw to the caller.
 *
 * The hook WAITS for the job promise: `after()` passes what its
 * callback to the `waitUntil` of the platform, and it is this promise that
 * keeps the invocation alive after the response. Detaching it (`void p.catch`)
 * would give up immediately, the lambda would freeze, and the job would die in flight — on an outgoing HTTP request, in "TypeError: fetch failed".
 */
export function afterOrNow(work: () => void | Promise<void>): void {
  const run = async () => {
    try {
      await work();
    } catch (e) {
      console.error("[after-safe] background work failed:", (e as Error).message);
    }
  };
  try {
    after(run);
  } catch {
    // Out of query context: we do the work now.
    void run();
  }
}

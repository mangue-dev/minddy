import "server-only";

import { after } from "next/server";

/**
 * Schedule best-effort background work after a request, or start it immediately
 * when shared mutation cores run outside a request. Routine event processing,
 * assignment and feedback hooks can use the same boundary from HTTP or workers.
 * Await the job inside the callback so the platform keeps its invocation alive;
 * errors are logged without propagating into the source mutation.
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

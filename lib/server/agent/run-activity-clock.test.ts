import { describe, expect, it, vi } from "vitest";

/**
 * `last_activity_at` HAS TWO READERS, AND ONLY ONE WRITER WHEN THE RUN IS WORKING.
 *
 * Both readers live in [drain.ts](drain.ts) and relate to
 * DISJOINT populations: the reaper of inactivity only looks at the idle runs
 * (it cuts off their microVM), the microVM watchdog only looks at the runs
 * `running` (it notes the death of their loop).
 *
 * Hence the rule that this test keeps: the heartbeat of the client and the steer ne
 * refresh this clock ONLY on an idle run. On a working run,
 * their bump brought nothing to the first reader — and it blinded the second. The
 * conversation opened in a tab beats every 45 s, the watchdog only probes
 * after three minutes of silence: a turn whose process had died
 * therefore remained `running` forever as long as someone was looking at it,
 * that is to say exactly when we looked at him the most. Unable to stop,
 *unable to guide, deleted by hand in production.
 */

const h = vi.hoisted(() => ({
  /** The constraints placed on the UPDATE, in the order the code writes them. */
  filters: [] as Array<{ op: string; column: string; value: unknown }>,
  updated: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      update: (fields: Record<string, unknown>) => {
        h.updated = fields;
        const chain = {
          eq: (column: string, value: unknown) => {
            h.filters.push({ op: "eq", column, value });
            return chain;
          },
          neq: (column: string, value: unknown) => {
            h.filters.push({ op: "neq", column, value });
            return Promise.resolve({});
          },
        };
        return chain;
      },
    }),
  }),
}));

const { bumpRunActivity } = await import("./runs");

describe("bumpRunActivity", () => {
  it("ne touche pas à l'horloge d'un run qui TRAVAILLE", async () => {
    await bumpRunActivity("run-1");
    expect(h.updated).toHaveProperty("last_activity_at");
    expect(h.filters).toEqual([
      { op: "eq", column: "id", value: "run-1" },
      // The guard that makes the clock readable by the watchdog: on a run
      // `running`, its only writer is the loop itself (its backup
      // periodic checkpoint, cf. control-plane.ts).
      { op: "neq", column: "status", value: "running" },
    ]);
  });
});

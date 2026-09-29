import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-599 — a code agent launched by Numo is stoppable INDIVIDUALLY. The stop
 * route used to refuse every Numo-owned run (`workerOwnedByNumo`), leaving the
 * conversation-wide stop as the only gesture; the refusal is gone and the same
 * read boundary (`canReadAgentRun`) decides who may stop a worker.
 */

const authed = vi.hoisted(() => ({ user: { id: "user-1" } }));
const interruptRequests: string[] = [];
const chainStops: string[] = [];
const messageConsumptions: Array<Record<string, unknown>> = [];
let drainKicks = 0;

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({
    ok: true,
    user: authed.user,
    supabase: {},
  }) as unknown as Awaited<ReturnType<typeof import("@/lib/server/api-auth").getAuthedUser>>,
}));

vi.mock("@/lib/server/agent/run-access", () => ({
  canReadAgentRun: async () => true,
}));

vi.mock("@/lib/server/agent/runs", () => ({
  getRun: async () => run,
  requestInterrupt: async (runId: string) => {
    interruptRequests.push(runId);
  },
}));

vi.mock("@/lib/server/agent/launch", () => ({
  kickAgentDrain: () => {
    drainKicks += 1;
  },
}));

// Chainable enough for the `agent_run_messages` consume of a worker stop.
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => ({
      update: (row: Record<string, unknown>) => ({
        eq: (_column: string, value: unknown) => ({
          is: () => {
            if (table === "agent_run_messages") {
              messageConsumptions.push({ ...row, run_id: value });
            }
            return Promise.resolve({ error: null });
          },
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/server/automations/hooks", () => ({
  stopChainOnInterrupt: (chainId: string) => {
    chainStops.push(chainId);
  },
}));

let run: Record<string, unknown>;

const { POST } = await import("@/app/api/agent-runs/[runId]/stop/route");

function request() {
  return new Request("http://localhost/api/agent-runs/run-1/stop", {
    method: "POST",
  }) as unknown as Parameters<typeof POST>[0];
}

const params = { params: Promise.resolve({ runId: "run-1" }) };

beforeEach(() => {
  run = { id: "run-1", status: "running", chain_id: null, parent_numo_turn_id: null };
  interruptRequests.length = 0;
  chainStops.length = 0;
  messageConsumptions.length = 0;
  drainKicks = 0;
});

describe("POST /api/agent-runs/[runId]/stop", () => {
  it("stops a worker delegated by Numo instead of refusing it", async () => {
    run.parent_numo_turn_id = "turn-1";

    const res = await POST(request(), params);

    expect(res.status).toBe(200);
    expect(interruptRequests).toEqual(["run-1"]);
  });

  it("swallows the steering queued for a stopped worker, like the stop RPC", async () => {
    // The executor re-queues a run that still carries an unconsumed message —
    // without the swallow, the stop would answer ok while the worker carried
    // on with a stale steer.
    run.parent_numo_turn_id = "turn-1";

    await POST(request(), params);

    expect(messageConsumptions).toEqual([
      { consumed_at: expect.any(String), run_id: "run-1" },
    ]);
  });

  it("does NOT swallow messages of a standalone stop (steer-then-interrupt pair)", async () => {
    // The composer pairs a steering message with the interrupt: the message
    // must survive and be played by the re-queued turn.
    await POST(request(), params);

    expect(messageConsumptions).toEqual([]);
  });

  it("still interrupts a standalone working run", async () => {
    const res = await POST(request(), params);

    expect(res.status).toBe(200);
    expect(interruptRequests).toEqual(["run-1"]);
  });

  it("does not touch the flag on a run already at rest", async () => {
    run.status = "completed";

    const res = await POST(request(), params);

    expect(res.status).toBe(200);
    expect(interruptRequests).toEqual([]);
    expect(drainKicks).toBe(0);
  });

  it("kicks the drain so an interrupted queued run rests right away", async () => {
    run.status = "queued";

    const res = await POST(request(), params);

    expect(res.status).toBe(200);
    expect(interruptRequests).toEqual(["run-1"]);
    expect(drainKicks).toBe(1);
  });

  it("keeps stopping the automation chain of a working chain run", async () => {
    run.chain_id = "chain-1";

    await POST(request(), params);

    expect(chainStops).toEqual(["chain-1"]);
  });

  it("does not stop the chain when the run is at rest", async () => {
    run.chain_id = "chain-1";
    run.status = "completed";

    await POST(request(), params);

    expect(chainStops).toEqual([]);
  });
});

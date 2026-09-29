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
});

describe("POST /api/agent-runs/[runId]/stop", () => {
  it("stops a worker delegated by Numo instead of refusing it", async () => {
    run.parent_numo_turn_id = "turn-1";

    const res = await POST(request(), params);

    expect(res.status).toBe(200);
    expect(interruptRequests).toEqual(["run-1"]);
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

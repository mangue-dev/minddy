import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  isOwner: true,
  rpc: vi.fn(),
  turns: [
    { id: "turn-2", conversation_id: "conversation", status: "waiting_work", cost_usd: 0.01 },
    { id: "turn-1", conversation_id: "conversation", status: "waiting_input", cost_usd: 0.02 },
  ],
}));
const occurrence = { id: "occurrence", conversation_id: "conversation", routine_id: "routine", error_message: null };
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: async () => ({ ok: true, user: { id: "owner" } }) }));
vi.mock("@/lib/server/routines", () => ({
  getRoutineForUser: async () => ({ isOwner: h.isOwner, routine: { id: "routine", project_id: "project", owner_id: "owner" } }),
  routineRunBudgetUsd: async () => 2,
}));
vi.mock("@/lib/server/agent/runs", () => ({ runsForRoutine: async () => [] }));
vi.mock("@/lib/server/billing-accounts", () => ({ getResolvedBilling: async () => ({ plan: { includedUsageUsd: 10 } }) }));
vi.mock("@/lib/server/routine-content", () => ({ decodeRoutine: async (row: unknown) => row }));
vi.mock("@/lib/server/numo/error-content", () => ({ decodeNumoError: async (_user: string, _table: string, _id: string, message: unknown) => message }));
vi.mock("@/lib/server/numo/final-content", () => ({ decodeNumoTurnOutcome: async (_user: string, _id: string, outcome: unknown) => outcome }));
vi.mock("@/lib/server/numo/start-intent", () => ({ startNumoIntent: vi.fn() }));
vi.mock("@/lib/server/numo/turns", () => ({ hydrateNumoTurn: async (turn: unknown) => turn }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: h.rpc,
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query, in: () => query,
        is: () => query, order: () => query, limit: () => query,
        maybeSingle: async () => ({ data: table === "agent_routines"
          ? { id: "routine", owner_id: "owner" } : occurrence, error: null }),
        single: async () => ({ data: { owner_id: "owner" }, error: null }),
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({
          data: table === "numo_assistant_turns" ? h.turns
            : table === "numo_routine_occurrences" ? [occurrence] : [], error: null,
        }).then(resolve),
      };
      return query;
    },
  }),
}));

beforeEach(() => {
  h.isOwner = true;
  h.rpc.mockReset().mockResolvedValue({ data: [{ conversation_id: "conversation", total_cost: "2.07", platform_cost: "1.57" }], error: null });
});

describe("routine occurrence usage consumers", () => {
  it("shows active delegated spend and only platform charges in the usage percentage", async () => {
    const { GET } = await import("@/app/api/routines/[id]/runs/route");
    const response = await GET({} as never, { params: Promise.resolve({ id: "routine" }) });
    const { runs } = await response.json();
    expect(runs[0]).toMatchObject({ cost_usd: 2.07, numo_status: "waiting_work" });
    expect(runs[0].usage_percent).toBeCloseTo(15.7);
  });

  it("keeps the owner's included-usage percentage private from other members", async () => {
    h.isOwner = false;
    const { GET } = await import("@/app/api/routines/[id]/runs/route");
    const response = await GET({} as never, { params: Promise.resolve({ id: "routine" }) });
    expect((await response.json()).runs[0]).toMatchObject({ cost_usd: 2.07, usage_percent: null });
  });

  it("includes BYOK and every resumed turn when enforcing the occurrence cap", async () => {
    const { routineContinuationForConversation } = await import("./routine-occurrences");
    const continuation = await routineContinuationForConversation("conversation", "owner");
    expect(continuation?.remainingBudgetUsd).toBe(0);
    h.rpc.mockResolvedValue({ data: [{ conversation_id: "conversation", total_cost: "1.7", platform_cost: "1.2" }], error: null });
    expect((await routineContinuationForConversation("conversation", "owner"))?.remainingBudgetUsd).toBeCloseTo(0.3);
  });
});

import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  table: "",
  verificationCalls: 0,
}));

vi.mock("./registry", () => ({
  getContentKeys: () => ({ current: async () => ({
    version: 1, bytes: Buffer.alloc(32),
  }) }),
}));
vi.mock("@/lib/server/agent/run-summary-content", () => ({
  isEncryptedRunSummary: () => true,
  encryptedRunSummaryState: () => ({ version: 1, format: 3 }),
  decodeRunSummary: async () => { throw new Error("Invalid authenticated ciphertext"); },
  decodeTurnSummaryValue: async () => { throw new Error("Invalid authenticated ciphertext"); },
}));
vi.mock("@/lib/server/agent/run-pr-url-content", () => ({
  isEncryptedAgentPrUrl: () => true,
  agentPrUrlState: () => ({ version: 1, format: 3 }),
  decodeAgentPrUrl: async () => { throw new Error("Invalid authenticated ciphertext"); },
  decodeAgentPrUrlValue: async () => { throw new Error("Invalid authenticated ciphertext"); },
}));

const query = {
  select: () => query,
  or: () => query,
  not: () => query,
  order: () => query,
  limit: async () => ({ data: [state.row], error: null }),
};
const service = {
  from: (table: string) => {
    expect(table).toBe(state.table);
    return query;
  },
  rpc: async (name: string, args: Record<string, unknown>) => {
    if (name === "mark_agent_backfill_attempt") {
      expect(args.p_table).toBe(state.table);
      return { data: true, error: null };
    }
    state.verificationCalls++;
    return { data: true, error: null };
  },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

const { backfillAgentRunSummariesBatch, backfillAgentTurnSummariesBatch } =
  await import("./agent-run-summary-backfill");
const { backfillAgentArtifactUrlsBatch, backfillAgentRunPrUrlsBatch } =
  await import("./agent-pr-url-backfill");

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_AGENT_SUMMARY_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_AGENT_PR_URL_ENCRYPTION_ENABLED", "true");
  state.verificationCalls = 0;
});

it("rejects an unauthenticated current run summary before checking it", async () => {
  state.table = "agent_runs";
  state.row = { id: "run-1", project_id: "project-1",
    outcome: "corrupt-current-envelope", error_message: null };
  expect(await backfillAgentRunSummariesBatch(1))
    .toMatchObject({ failed: 1, unchanged: 0 });
  expect(state.verificationCalls).toBe(0);
});

it("rejects an unauthenticated current turn summary before checking it", async () => {
  state.table = "agent_turns";
  state.row = { id: "turn-1", run_id: "run-1", conversation: { project_id: "project-1" },
    outcome: "corrupt-current-envelope", error_message: null };
  expect(await backfillAgentTurnSummariesBatch(1))
    .toMatchObject({ failed: 1, unchanged: 0 });
  expect(state.verificationCalls).toBe(0);
});

it("rejects an unauthenticated current artifact URL before checking it", async () => {
  state.table = "agent_artifacts";
  state.row = { id: "artifact-1", run_id: null, url: "corrupt-current-envelope",
    url_bound_run_id: null, conversation: { project_id: "project-1" } };
  expect(await backfillAgentArtifactUrlsBatch(1))
    .toMatchObject({ failed: 1, unchanged: 0 });
  expect(state.verificationCalls).toBe(0);
});

it("rejects an unauthenticated current run URL before checking it", async () => {
  state.table = "agent_runs";
  state.row = { id: "run-1", project_id: "project-1",
    pr_url: "corrupt-current-envelope" };
  expect(await backfillAgentRunPrUrlsBatch(1))
    .toMatchObject({ failed: 1, unchanged: 0 });
  expect(state.verificationCalls).toBe(0);
});

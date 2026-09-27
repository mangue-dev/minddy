import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  table: "",
  idColumn: "id",
  row: {} as Record<string, unknown>,
  attempts: 0,
}));

vi.mock("@/lib/server/agent/run-base-branch-content", () => ({
  decodeAgentBaseBranch: async () => { throw new Error("Invalid ciphertext"); },
  decodeRuntimeBaseBranch: async () => { throw new Error("Invalid ciphertext"); },
}));
vi.mock("@/lib/server/agent/run-work-branch-content", () => ({
  decodeAgentWorkBranch: async () => { throw new Error("Invalid ciphertext"); },
  decodeRuntimeWorkBranch: async () => { throw new Error("Invalid ciphertext"); },
  decodeWorkBranchValue: async () => { throw new Error("Invalid ciphertext"); },
}));

const query = {
  select: () => query,
  not: () => query,
  is: () => query,
  eq: () => query,
  order: () => query,
  limit: async () => ({ data: [state.row], error: null }),
};
const service = {
  from: (table: string) => {
    expect(table).toBe(state.table);
    return query;
  },
  rpc: async (name: string, args: Record<string, unknown>) => {
    expect(name).toBe("mark_agent_backfill_attempt");
    expect(args.p_table).toBe(state.table);
    expect(args.p_id_column).toBe(state.idColumn);
    expect(args.p_id).toBe(state.row[state.idColumn]);
    state.attempts++;
    return { data: true, error: null };
  },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

const { backfillAgentRunBaseBranchesBatch,
  backfillOrphanRuntimeBaseBranchesBatch } =
  await import("./agent-base-branch-backfill");
const { backfillAgentArtifactBranchesBatch, backfillAgentRunWorkBranchesBatch,
  backfillOrphanRuntimeWorkBranchesBatch } =
  await import("./agent-work-branch-backfill");

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_AGENT_BASE_BRANCH_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_AGENT_WORK_BRANCH_ENCRYPTION_ENABLED", "true");
  state.attempts = 0;
});

it.each([
  ["run base branch", backfillAgentRunBaseBranchesBatch,
    "agent_runs", "id", { id: "run-1", project_id: "project-1", base_branch: "broken" }],
  ["orphan base branch", backfillOrphanRuntimeBaseBranchesBatch,
    "agent_runtime_sessions", "conversation_id",
    { conversation_id: "conversation-1", current_run_id: null,
      base_branch: "broken", base_branch_bound_run_id: null,
      conversation: { project_id: "project-1" } }],
  ["artifact work branch", backfillAgentArtifactBranchesBatch,
    "agent_artifacts", "id", { id: "artifact-1", conversation_id: "conversation-1",
      run_id: null, ref: "opaque", ref_ciphertext: "broken", ref_bound_run_id: null,
      conversation: { project_id: "project-1" } }],
  ["run work branch", backfillAgentRunWorkBranchesBatch,
    "agent_runs", "id", { id: "run-1", project_id: "project-1", branch_name: "broken" }],
  ["orphan work branch", backfillOrphanRuntimeWorkBranchesBatch,
    "agent_runtime_sessions", "conversation_id",
    { conversation_id: "conversation-1", current_run_id: null,
      work_branch: "broken", work_branch_bound_run_id: null,
      conversation: { project_id: "project-1" } }],
])("records the %s attempt on its source row", async (_label, worker,
  table, idColumn, row) => {
  state.table = table;
  state.idColumn = idColumn;
  state.row = row;
  expect(await worker(1)).toMatchObject({ scanned: 1, failed: 1,
    conflicted: 0, unchanged: 0 });
  expect(state.attempts).toBe(1);
});

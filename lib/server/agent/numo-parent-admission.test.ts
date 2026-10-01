import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  parentStatus: "running",
  stopBeforeInsertCommit: false,
  parentReadFails: false,
  run: null as Record<string, unknown> | null,
  parentReads: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: vi.fn() }));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: async () => ({ role: "owner" }) }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({
  from: (table: string) => {
    let insert: Record<string, unknown> | null = null;
    let update: Record<string, unknown> | null = null;
    const filters: Record<string, unknown> = {};
    const execute = async () => {
      if (table === "numo_assistant_turns") {
        h.parentReads.push(filters);
        if (h.parentReadFails) return { data: null, error: { message: "Unavailable" } };
        return { data: { status: h.parentStatus }, error: null };
      }
      if (table === "project_git_links") return { data: null, error: null };
      if (table !== "agent_runs") throw new Error(`Unexpected table: ${table}`);
      if (insert) {
        // The stop cascade has already scanned the queue when this insert lands.
        if (h.stopBeforeInsertCommit) h.parentStatus = "stopped";
        h.run = { ...insert, id: "worker-1", interrupt_requested: false };
      }
      if (update && h.run) Object.assign(h.run, update);
      return { data: h.run ? { ...h.run } : null, error: null };
    };
    const query = {
      insert: (values: Record<string, unknown>) => { insert = values; return query; },
      update: (values: Record<string, unknown>) => { update = values; return query; },
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      in: () => query,
      single: execute,
      maybeSingle: execute,
      then: (resolve: (value: unknown) => unknown) => execute().then(resolve),
    };
    return query;
  },
  rpc: async (name: string) => {
    if (!["claim_agent_run", "claim_local_agent_run"].includes(name)) {
      throw new Error(`Unexpected RPC: ${name}`);
    }
    h.run!.status = "running";
    return { data: [{ ...h.run }], error: null };
  },
}) }));

import { claimLocalRun, claimRun, createRun, runAuthorityIsCurrent, type AgentRun, type CreateRunInput } from "./runs";

const input: CreateRunInput = {
  projectId: "project-1", issueId: null, createdBy: "user-1",
  repoLinkId: null, connectionId: null, repoProvider: null, repoExternalId: null,
  prompt: "Implement the fix", model: "z-ai/glm-5.3-flash", modelForced: true,
  reasoningLevel: "low", keyMode: "byok", workerModelProvider: "openrouter", triggeredBy: "chat",
  parentNumoConversationId: "conversation-1", parentNumoTurnId: "turn-1", parentNumoToolCallId: "tool-1",
  delegationBrief: { version: 1, correlation: { parentConversationId: "conversation-1",
    parentTurnId: "turn-1", toolCallId: "tool-1" }, targetRepository: { projectId: "project-1",
    provider: "github", externalId: "repo-1", fullName: "example/repo", defaultBranch: "main" },
    objective: "Implement the fix", sourceReferences: [], constraints: [], authorizedWork: [], expectedOutput: [] },
};

beforeEach(() => {
  vi.stubEnv("MINDDY_DATA_ROOT_KEY", "");
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
  h.parentStatus = "running";
  h.stopBeforeInsertCommit = false;
  h.parentReadFails = false;
  h.run = null;
  h.parentReads = [];
});
afterEach(() => vi.unstubAllEnvs());

describe("Numo delegated worker admission", () => {
  it("interrupts a BYOK worker inserted after the stop cascade already ran", async () => {
    h.stopBeforeInsertCommit = true;
    const run = await createRun(input);
    expect(run.interrupt_requested).toBe(true);
    expect(h.run?.interrupt_requested).toBe(true);
    expect(h.parentReads).toEqual([{ id: "turn-1", conversation_id: "conversation-1", user_id: "user-1" }]);
  });

  it.each(["cloud", "local"])("preserves a queued %s sibling after an individual stop retires the parent", async (mode) => {
    await createRun(input);
    h.parentStatus = "stopped";
    const run = mode === "cloud" ? await claimRun("worker-1") : await claimLocalRun({
      runId: "worker-1", userId: "user-1", deviceId: "device-1",
    });
    expect(run?.status).toBe("running");
    expect(h.run).toMatchObject({ status: "running", interrupt_requested: false });
  });

  it("admits an active parent and preserves already-running sibling authority after an individual stop", async () => {
    await createRun(input);
    const claimed = await claimRun("worker-1");
    expect(claimed?.status).toBe("running");
    h.parentStatus = "stopped";
    const reads = h.parentReads.length;
    expect(await runAuthorityIsCurrent(claimed as AgentRun)).toBe(true);
    expect(h.parentReads).toHaveLength(reads);
  });

  it("allows an admitted sibling to start while another worker awaits input", async () => {
    await createRun(input);
    h.parentStatus = "waiting_input";
    expect((await claimRun("worker-1"))?.status).toBe("running");
  });

  it("requests interruption before surfacing a failed postinsert parent check", async () => {
    h.parentReadFails = true;
    await expect(createRun(input)).rejects.toThrow("Could not verify the Numo worker parent");
    expect(h.run?.interrupt_requested).toBe(true);
  });
});

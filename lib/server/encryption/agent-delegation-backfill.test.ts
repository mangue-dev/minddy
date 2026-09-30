import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";
import { AGENT_DELEGATION_AUTHORIZATIONS, AGENT_DELEGATION_CONTRACT_VERSION,
  parseAgentDelegationBrief, parseAgentDelegationResult } from "@/lib/server/agent/agent-contract";

const state = vi.hoisted(() => ({ row: {} as Record<string, unknown>, writes: [] as Record<string, unknown>[] }));
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.alloc(32, 5) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.alloc(32, 5) }),
});
vi.mock("./registry", () => ({ getEncryptedStore: () => store,
  getContentKeys: () => ({ current: async () => ({ version: 1, bytes: Buffer.alloc(32, 5) }) }) }));
vi.mock("./audit", () => ({ auditDecryption: vi.fn() }));
vi.mock("./agent-backfill-attempt", () => ({ markAgentBackfillAttempt: async () => true }));
vi.mock("./content-config", () => ({ isContentEncryptionEnabled: () => true }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({
  from: () => {
    const query = { select: () => query, not: () => query, or: () => query,
      order: () => query, limit: async () => ({ data: [state.row], error: null }) };
    return query;
  },
  rpc: async (_name: string, args: Record<string, unknown>) => {
    state.writes.push(args); return { data: true, error: null };
  },
}) }));

import { backfillAgentDelegationBatch } from "./agent-delegation-backfill";
import { backfillAgentDelegationResultsBatch } from "./agent-delegation-result-backfill";

/** PostgreSQL JSONB returns object keys independently of application insertion order. */
function reordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, reordered(child)]));
  return value;
}
beforeEach(() => { state.writes = []; });

describe("historical delegation migration verification", () => {
  it("migrates JSONB-ordered briefs without changing their logical content", async () => {
    const brief = parseAgentDelegationBrief({ version: AGENT_DELEGATION_CONTRACT_VERSION,
      correlation: { parentConversationId: "conversation", parentTurnId: "turn", toolCallId: "call" },
      targetRepository: { projectId: "project", provider: "github", externalId: "repo",
        fullName: "fixture/repository", defaultBranch: "main" },
      objective: "Private objective", sourceReferences: [], constraints: [],
      authorizedWork: [AGENT_DELEGATION_AUTHORIZATIONS[0]], expectedOutput: ["Report the outcome"] });
    state.row = { id: "run", project_id: "project", parent_numo_turn_id: "turn",
      delegation_brief: reordered(brief), delegation_attachments: [],
      encrypted_delegation_input: null, delegation_encryption_version: 0 };
    expect(await backfillAgentDelegationBatch()).toMatchObject({ migrated: 1, failed: 0 });
    expect(state.writes).toHaveLength(1);
    await expect(store.decrypt(store.fromDatabase(state.writes[0].p_cipher as string), {
      scope: { kind: "project", id: "project" }, table: "agent_runs", column: "delegation_input", rowId: "run",
    })).resolves.toEqual({ delegation_brief: brief, delegation_attachments: [] });
  });

  it("migrates JSONB-ordered results while preserving nested arrays and objects", async () => {
    const result = parseAgentDelegationResult({ version: AGENT_DELEGATION_CONTRACT_VERSION,
      status: "completed", summary: "Private summary", changedFiles: ["first.ts", "second.ts"],
      verificationPerformed: [{ command: "npm test", status: "passed" }],
      artifacts: [{ kind: "branch", ref: "fixture-branch" }], unresolvedDecisions: [] });
    state.row = { id: "run", project_id: "project", delegation_result: reordered(result),
      delegation_result_ciphertext: null, delegation_result_encryption_version: 0 };
    expect(await backfillAgentDelegationResultsBatch()).toMatchObject({ migrated: 1, failed: 0 });
    expect(state.writes).toHaveLength(1);
    await expect(store.decrypt(store.fromDatabase(state.writes[0].p_cipher as string), {
      scope: { kind: "project", id: "project" }, table: "agent_runs", column: "delegation_result", rowId: "run",
    })).resolves.toEqual(result);
  });
});

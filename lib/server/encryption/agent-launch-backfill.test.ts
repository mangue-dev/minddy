import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";

const state = vi.hoisted(() => ({
  version: 1,
  row: {} as Record<string, unknown>,
  firstMessage: "",
  commits: 0,
}));
const key = Buffer.alloc(32, 19);
const store = new EncryptedStore({
  current: async () => ({ version: state.version, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("./registry", () => ({
  getEncryptedStore: () => store,
  getContentKeys: () => ({
    current: async () => ({ version: state.version, bytes: Buffer.from(key) }),
  }),
}));
vi.mock("./audit", () => ({ auditDecryption: vi.fn() }));
const query = {
  select: () => query,
  order: () => query,
  limit: async () => ({ data: [state.row], error: null }),
};
const service = {
  from: () => query,
  rpc: async (_name: string, args: Record<string, unknown>) => {
    if (args.p_previous_version !== state.row.launch_encryption_version ||
        args.p_project_id !== state.row.project_id ||
        args.p_conversation_id !== state.row.conversation_id) {
      return { data: false, error: null };
    }
    if (args.p_content) {
      state.commits++;
      state.row = { ...state.row, prompt: null, prompt_mentions: null,
        encrypted_launch_content: args.p_content,
        launch_encryption_version: args.p_version };
      state.firstMessage = String(args.p_content);
    }
    return { data: true, error: null };
  },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

const { backfillAgentLaunchBatch } = await import("./agent-launch-backfill");
const { decodeAgentLaunch } = await import("@/lib/server/agent/run-launch-content");

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_AGENT_LAUNCH_ENCRYPTION_ENABLED", "true");
  state.version = 1;
  state.commits = 0;
  state.firstMessage = "Private launch request";
  state.row = {
    id: "run-1", project_id: "project-1", conversation_id: "conversation-1",
    prompt: "Private launch request",
    prompt_mentions: [{ label: "Private issue" }],
    encrypted_launch_content: null, launch_encryption_version: 0,
  };
});

describe("agent launch migration", () => {
  it("atomically removes launch text and its message copy, then rotates both", async () => {
    expect(await backfillAgentLaunchBatch(1)).toMatchObject({ migrated: 1, failed: 0 });
    expect(state.row.prompt).toBeNull();
    expect(state.row.prompt_mentions).toBeNull();
    expect(JSON.stringify(state.row)).not.toContain("Private launch request");
    expect(state.firstMessage).not.toContain("Private launch request");
    expect(await decodeAgentLaunch(state.row as Parameters<typeof decodeAgentLaunch>[0]))
      .toMatchObject({ prompt: "Private launch request",
        prompt_mentions: [{ label: "Private issue" }] });
    state.version = 2;
    expect(await backfillAgentLaunchBatch(1)).toMatchObject({ migrated: 1, failed: 0 });
    expect(state.row.launch_encryption_version).toBe(2);
    expect(state.firstMessage).toBe(state.row.encrypted_launch_content);
    expect(await backfillAgentLaunchBatch(1)).toMatchObject({ unchanged: 1, failed: 0 });
    expect(state.commits).toBe(2);
    vi.unstubAllEnvs();
  });
});

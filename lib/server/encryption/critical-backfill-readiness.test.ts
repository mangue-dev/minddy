import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";

const state = vi.hoisted(() => ({
  root: 7,
  tables: {} as Record<string, Record<string, unknown>[]>,
  dropAfterFirstPage: false,
  prPageCalls: 0,
}));
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.alloc(32, state.root) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.alloc(32, state.root) }),
});
vi.mock("./registry", () => ({
  getEncryptedStore: () => store,
  getContentKeys: () => ({ current: async () => ({
    version: 1, bytes: Buffer.alloc(32, state.root),
  }) }),
  getBlindIndexKeys: () => ({ current: async () => ({
    version: 1, bytes: Buffer.alloc(32, 9),
  }) }),
}));
vi.mock("./audit", () => ({ auditDecryption: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      let after: string | number | null = null;
      let id: string | null = null;
      const query = { select: () => query, order: () => query,
        eq: (_column: string, value: string) => {
          id = value;
          return query;
        },
        maybeSingle: async () => ({ data: (state.tables[table] ?? [])
          .find((row) => row.id === id) ?? null, error: null }),
        gt: (_column: string, value: string | number) => {
          after = value;
          return query;
        },
        limit: async (limit: number) => {
          const data = (state.tables[table] ?? [])
            .filter((row) => after === null || String(row.id ?? row.conversation_id) > String(after))
            .slice(0, limit);
          if (table === "pull_requests" && ++state.prPageCalls === 1 &&
              state.dropAfterFirstPage) state.tables.pull_requests.shift();
          return { data, error: null };
        } };
      return query;
    },
  }),
}));

const { encodePullRequestUrl } = await import("@/lib/server/agent/pull-request-url-content");
const { encodePullRequestContent } = await import("@/lib/server/agent/pull-request-content");
const { encodeAgentCheckpoint } = await import("@/lib/server/agent/run-checkpoint-content");
const { encryptJournal, journalEncodedRow } = await import("@/lib/server/agent/encrypted-journal");
const { verifyCriticalBackfillReadiness } = await import("./critical-backfill-readiness");

beforeEach(() => {
  state.root = 7;
  state.tables = {};
  state.dropAfterFirstPage = false;
  state.prPageCalls = 0;
});

describe("critical backfill readiness", () => {
  it("authenticates each source even when its checked timestamp is set", async () => {
    const pr = "pr-1", run = "run-1", project = "project-1", conversation = "conversation-1";
    const checkpoint = { messages: [{ role: "user", content: "Private checkpoint" }] };
    const runCipher = await encodeAgentCheckpoint(project, run, checkpoint as never);
    const runtimeCipher = await store.encrypt(checkpoint, {
      scope: { kind: "project", id: project }, table: "agent_runtime_sessions",
      column: "checkpoint", rowId: "orphan-1",
    });
    const journal = await encryptJournal(project, {
      ...journalEncodedRow(run, "session-1", [{ seq: 1, output: "Private output" }]),
      id: 1, encryption_version: 0,
    });
    state.tables = {
      pull_requests: [{ id: pr, url: await encodePullRequestUrl(pr, "https://private.invalid"),
        title: await encodePullRequestContent(pr, "title", "Private title"),
        head_branch: null, base_branch: null,
        url_encryption_checked_at: "checked", content_encryption_checked_at: "checked" }],
      agent_runs: [{ id: run, project_id: project, conversation_id: conversation,
        ...runCipher,
        checkpoint_encryption_checked_at: "checked" }],
      agent_runtime_sessions: [
        { conversation_id: conversation, current_run_id: run,
          conversation: { project_id: project }, checkpoint: null,
          checkpoint_ciphertext: runCipher.checkpoint_ciphertext,
          checkpoint_encryption_version: 1,
          checkpoint_encryption_checked_at: null },
        { conversation_id: "orphan-1", current_run_id: null,
          conversation: { project_id: project }, checkpoint: null,
          checkpoint_ciphertext: runtimeCipher, checkpoint_encryption_version: 1,
          checkpoint_encryption_checked_at: "checked" },
      ],
      agent_run_journal: [{ ...journal, run: { project_id: project },
        encryption_checked_at: "checked" }],
    };
    expect(await verifyCriticalBackfillReadiness()).toMatchObject({
      ready: true, blocked: { pullRequests: 0, runCheckpoints: 0,
        runtimeCheckpoints: 0, journals: 0 },
    });
    state.tables.agent_runtime_sessions[0].checkpoint_ciphertext = runtimeCipher;
    expect(await verifyCriticalBackfillReadiness()).toMatchObject({
      ready: false, blocked: { runtimeCheckpoints: 1 },
    });
    state.tables.agent_runtime_sessions[0].checkpoint_ciphertext =
      runCipher.checkpoint_ciphertext;
    const source = state.tables.pull_requests[0];
    const wrapper = String(source.url).split(":");
    const envelope = JSON.parse(Buffer.from(wrapper[2], "base64url").toString("utf8"));
    envelope.tag = (envelope.tag[0] === "A" ? "B" : "A") + envelope.tag.slice(1);
    source.url = `${wrapper[0]}:${wrapper[1]}:${Buffer.from(JSON.stringify(envelope)).toString("base64url")}`;
    expect(await verifyCriticalBackfillReadiness()).toMatchObject({
      ready: false, blocked: { pullRequests: 1, runCheckpoints: 0,
        runtimeCheckpoints: 0, journals: 0 },
    });
    state.root = 8;
    expect(await verifyCriticalBackfillReadiness()).toMatchObject({
      ready: false, blocked: { pullRequests: 1, runCheckpoints: 1,
        runtimeCheckpoints: 2, journals: 1 },
    });
  });

  it("continues a keyset scan after an earlier row is deleted", async () => {
    state.tables.pull_requests = Array.from({ length: 101 }, (_, index) => ({
      id: `pr-${String(index).padStart(3, "0")}`, url: null, title: null,
      head_branch: null, base_branch: null, url_encryption_checked_at: null,
      content_encryption_checked_at: null,
    }));
    state.dropAfterFirstPage = true;
    expect(await verifyCriticalBackfillReadiness()).toMatchObject({
      ready: true, scanned: { pullRequests: 101 },
    });
  });
});

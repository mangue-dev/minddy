import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";

const state = vi.hoisted(() => ({
  root: 7,
  tables: {} as Record<string, Record<string, unknown>[]>,
  dropAfterFirstPage: false,
  prPageCalls: 0,
  currentKeyWrites: 0,
  databaseWrites: 0,
  keyPresent: true,
}));
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.alloc(32, state.root) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.alloc(32, state.root) }),
});
vi.mock("./registry", () => ({
  getEncryptedStore: () => store,
  getContentKeys: () => ({
    current: async () => {
      state.currentKeyWrites++;
      return { version: 1, bytes: Buffer.alloc(32, state.root) };
    },
    existingCurrent: async () => state.keyPresent
      ? { version: 1, bytes: Buffer.alloc(32, state.root) } : null,
  }),
  getBlindIndexKeys: () => ({ current: async () => ({
    version: 1, bytes: Buffer.alloc(32, 9),
  }) }),
}));
vi.mock("./audit", () => ({ auditDecryption: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: () => { state.databaseWrites++; throw new Error("Readiness attempted an RPC"); },
    from: (table: string) => {
      let after: string | number | null = null;
      let id: string | null = null;
      const query = { select: () => query, order: () => query,
        insert: () => { state.databaseWrites++; throw new Error("Readiness attempted an insert"); },
        update: () => { state.databaseWrites++; throw new Error("Readiness attempted an update"); },
        upsert: () => { state.databaseWrites++; throw new Error("Readiness attempted an upsert"); },
        delete: () => { state.databaseWrites++; throw new Error("Readiness attempted a delete"); },
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
            .filter((row) => after === null ||
              String(row.id ?? row.conversation_id ?? row.client_id ??
                row.code_hash ?? row.user_id) > String(after))
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
const { encodeOAuthClientContent } = await import("@/lib/server/oauth/client-content");
const { encodeOAuthCodeContent } = await import("@/lib/server/oauth/code-content");
const { encodeApiKeyContent } = await import("@/lib/server/api-key-content");
const { encodeIntegrationField } = await import("@/lib/server/integration-content");
const { sealPush } = await import("@/lib/server/push/content");
const { encodeBillingField } = await import("@/lib/server/billing-content");
const { verifyCriticalBackfillReadiness } = await import("./critical-backfill-readiness");

beforeEach(() => {
  state.root = 7;
  state.tables = {};
  state.dropAfterFirstPage = false;
  state.prPageCalls = 0;
  state.currentKeyWrites = 0;
  state.databaseWrites = 0;
  state.keyPresent = true;
});

describe("critical backfill readiness", () => {
  it("authenticates integration, push and billing copies without writing", async () => {
    const integration = { id: "integration-1", project_id: "project-1" };
    const push = { user_id: "user-1", endpoint_digest: "digest-1" };
    const content = { endpoint: "https://private.invalid", p256dh: null,
      auth: null, native_installation_id: null, device_label: null,
      user_agent: null };
    state.tables = {
      integrations: [{ ...integration,
        name: await encodeIntegrationField(integration, "name", "Private integration"),
        webhook_url: null, name_encryption_checked_at: "checked",
        webhook_encryption_checked_at: null }],
      push_subscriptions: [{ id: "push-1", ...push,
        endpoint: null, p256dh: null, auth: null, native_installation_id: null,
        device_label: null, user_agent: null,
        encrypted_content: await sealPush(push, content),
        encryption_checked_at: "checked" }],
      billing_accounts: [{ user_id: "user-1",
        email: await encodeBillingField("user-1", "email", "private@example.test"),
        admin_override_note: null, email_encryption_checked_at: "checked",
        admin_override_note_encryption_checked_at: null }],
    };
    expect(await verifyCriticalBackfillReadiness()).toMatchObject({ ready: true,
      blocked: { integrations: 0, pushSubscriptions: 0, billingIdentities: 0 } });
    state.tables.integrations[0].name = "mdye3:{\"format\":3,\"keyVersion\":1}";
    state.tables.push_subscriptions[0].encrypted_content =
      "mdye3:{\"format\":3,\"keyVersion\":1}";
    state.tables.billing_accounts[0].email =
      "mdye3:{\"format\":3,\"keyVersion\":1}";
    expect(await verifyCriticalBackfillReadiness()).toMatchObject({ ready: false,
      blocked: { integrations: 1, pushSubscriptions: 1, billingIdentities: 1 } });
    expect(state.currentKeyWrites).toBe(0);
    expect(state.databaseWrites).toBe(0);
  });

  it("authenticates OAuth and API-key rows even when their SQL proof marker is set", async () => {
    const clientId = "client-1", codeHash = "code-1", userId = "user-1", id = "api-1";
    const client = await encodeOAuthClientContent(clientId, {
      client_name: "Private client", redirect_uris: ["https://private.invalid"],
      logo_uri: null, client_uri: null,
    });
    const code = await encodeOAuthCodeContent({ code_hash: codeHash, user_id: userId },
      { redirect_uri: "https://private.invalid", resource: null });
    const api = await encodeApiKeyContent({ id, user_id: userId },
      { name: "Private key", agent: null });
    state.tables = {
      oauth_clients: [{ client_id: clientId, client_name: null, redirect_uris: null,
        logo_uri: null, client_uri: null, created_at: "2026-09-27", ...client,
        encryption_checked_at: "checked" }],
      oauth_authorization_codes: [{ code_hash: codeHash, user_id: userId,
        redirect_uri: null, resource: null, ...code, encryption_checked_at: "checked" }],
      api_keys: [{ id, user_id: userId, name: null, agent: null,
        ...api, encryption_checked_at: "checked" }],
    };
    expect(await verifyCriticalBackfillReadiness()).toMatchObject({ ready: true,
      blocked: { oauthClients: 0, oauthCodes: 0, apiKeys: 0 } });
    state.tables.oauth_clients[0].encrypted_content = '{"format":3,"keyVersion":1}';
    state.tables.oauth_authorization_codes[0].encrypted_content = '{"format":3,"keyVersion":1}';
    state.tables.api_keys[0].encrypted_content = '{"format":3,"keyVersion":1}';
    expect(await verifyCriticalBackfillReadiness()).toMatchObject({ ready: false,
      blocked: { oauthClients: 1, oauthCodes: 1, apiKeys: 1 } });
    expect(state.currentKeyWrites).toBe(0);
    expect(state.databaseWrites).toBe(0);
  });

  it("never creates a key while checking a legacy row", async () => {
    state.tables.pull_requests = [{ id: "pr-legacy", url: "https://private.invalid",
      title: null, head_branch: null, base_branch: null,
      url_encryption_checked_at: null, content_encryption_checked_at: null }];
    expect(await verifyCriticalBackfillReadiness()).toMatchObject({
      ready: false, blocked: { pullRequests: 1 },
    });
    expect(state.currentKeyWrites).toBe(0);
    expect(state.databaseWrites).toBe(0);
  });

  it("blocks readiness when the system content key is absent", async () => {
    state.keyPresent = false;
    expect(await verifyCriticalBackfillReadiness()).toMatchObject({
      ready: false, missingKeys: 1,
    });
    expect(state.currentKeyWrites).toBe(0);
    expect(state.databaseWrites).toBe(0);
  });
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
    expect(state.currentKeyWrites).toBe(0);
    expect(state.databaseWrites).toBe(0);
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

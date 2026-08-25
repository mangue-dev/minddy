import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FakeQuery,
  setFakeTable,
} from "../../../test/forge-relay/fake-supabase";

/**
 * `ensureGitlabIssuesHook` in RELAY mode
 * (docs/managed-forge-relay-plan.md, "Webhook relay" / GitLab).
 *
 * Pinned properties: the hook URL points at Cloud's relay receiver; the hook
 * is identified by the stable DESCRIPTION marker so flipping between local
 * and relay UPDATES it instead of creating a duplicate (duplicate hooks mean
 * duplicate deliveries, one of which fails signature verification at the
 * instance); the per-repo secret is pushed to Cloud at registration AND on
 * rotation — this function IS both paths.
 */

vi.stubEnv("GITLAB_OAUTH_CLIENT_ID", "client-id");
vi.stubEnv("GITLAB_OAUTH_CLIENT_SECRET", "client-secret");
vi.stubEnv("GIT_STATE_SECRET", "state-secret-0123456789abcdef0123456789abcdef");
vi.stubEnv("GIT_TOKEN_ENCRYPTION_SECRET", "token-crypto-secret-0123456789abcdef");

vi.mock("@/lib/site", () => ({ SITE_URL: "https://on-prem.example.com" }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => new FakeQuery(name) }),
}));

let relayConfigured = true;
const relayCalls: { path: string; body: Record<string, unknown> }[] = [];

vi.mock("@/lib/server/forge-relay/client", () => ({
  isForgeRelayClientConfigured: () => relayConfigured,
  forgeRelayConfig: () =>
    relayConfigured
      ? { url: "https://relay.example.com", instanceId: "instance", secret: "secret" }
      : null,
  relayRequest: async (path: string, body: Record<string, unknown>) => {
    relayCalls.push({ path, body });
    return { ok: true, status: 200, data: { ok: true }, error: null };
  },
}));

type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[] = [];
let existingHooks: Record<string, unknown>[] = [];

vi.stubGlobal(
  "fetch",
  async (url: string | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init: init ?? {} });
    if (String(url).endsWith("/hooks") && (init?.method ?? "GET") === "GET") {
      return new Response(JSON.stringify(existingHooks), { status: 200 });
    }
    return new Response(JSON.stringify({ id: 555 }), { status: 200 });
  },
);

function seedLink(): void {
  setFakeTable("project_git_links", [
    {
      provider: "gitlab",
      external_repo_id: "1001",
      repo_full_name: "acme/app",
    },
  ]);
}

const { ensureGitlabIssuesHook, GITLAB_HOOK_MARKER } = await import("./gitlab-app");

beforeEach(() => {
  relayConfigured = true;
  fetchCalls = [];
  relayCalls.length = 0;
  existingHooks = [];
  seedLink();
});

describe("ensureGitlabIssuesHook — relay mode", () => {
  it("points new hooks at Cloud with the stable marker and shares the secret", async () => {
    const hookId = await ensureGitlabIssuesHook("token", "1001", {
      enabled: true,
      secret: "per-repo-hook-secret-0123456789abcdef",
      source: "relay",
    });

    expect(hookId).toBe("555");
    const create = fetchCalls.find((c) => c.init.method === "POST");
    expect(create).toBeDefined();
    const body = JSON.parse(String(create?.init.body));
    expect(body.url).toBe("https://relay.example.com/api/relay/gitlab/webhook");
    expect(body.description).toBe(GITLAB_HOOK_MARKER);
    expect(relayCalls).toEqual([
      {
        path: "/api/relay/gitlab/hook-secret",
        body: {
          repoId: "1001",
          repo: "acme/app",
          secret: "per-repo-hook-secret-0123456789abcdef",
        },
      },
    ]);
  });

  it("UPDATES a marker-matching hook instead of duplicating it when the URL changes", async () => {
    // Hook installed back when the instance served its own webhooks.
    existingHooks = [
      {
        id: 777,
        url: "https://on-prem.example.com/api/webhooks/gitlab",
        description: GITLAB_HOOK_MARKER,
        issues_events: true,
        merge_requests_events: true,
      },
    ];

    await ensureGitlabIssuesHook("token", "1001", {
      secret: "per-repo-hook-secret-0123456789abcdef",
      source: "relay",
    });

    // Exactly one write, and it is a PUT of the EXISTING hook.
    expect(fetchCalls.filter((c) => c.init.method === "POST")).toHaveLength(0);
    const put = fetchCalls.find((c) => c.init.method === "PUT");
    expect(put?.url).toContain("/hooks/777");
    const body = JSON.parse(String(put?.init.body));
    expect(body.url).toBe("https://relay.example.com/api/relay/gitlab/webhook");
    expect(relayCalls).toHaveLength(1);
  });

  it("keeps the local URL and never pushes secrets without the relay", async () => {
    relayConfigured = false;
    await ensureGitlabIssuesHook("token", "1001", {
      enabled: true,
      secret: "per-repo-hook-secret-0123456789abcdef",
      source: "relay",
    });
    const create = fetchCalls.find((c) => c.init.method === "POST");
    const body = JSON.parse(String(create?.init.body));
    expect(body.url).toBe("https://on-prem.example.com/api/webhooks/gitlab");
    expect(relayCalls).toHaveLength(0);
  });

  it("keeps a LOCAL connection instance-pointed even when the relay is configured", async () => {
    // Mixed setup: an operator-owned GitLab app alongside the relay. Local
    // repositories must never leak their name or hook secret to Cloud.
    await ensureGitlabIssuesHook("token", "1001", {
      enabled: true,
      secret: "per-repo-hook-secret-0123456789abcdef",
      source: "local",
    });
    const create = fetchCalls.find((c) => c.init.method === "POST");
    const body = JSON.parse(String(create?.init.body));
    expect(body.url).toBe("https://on-prem.example.com/api/webhooks/gitlab");
    expect(relayCalls).toHaveLength(0);
  });
});

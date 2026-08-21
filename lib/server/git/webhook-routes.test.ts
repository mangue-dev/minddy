import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two forge webhook receivers, trained at the gate (MIN-333).
 *
 * The neighbor file (`webhook-tenant-isolation.test.ts`) holds the mechanics of the
 * secret and routing; this one holds what the ROUTE does in it — the code of
 * response, and especially what is processed or not. It's the half that
 * counts for an attacker: a 401 that has already been written protects nothing.
 *
 * Three promises, the same on both sides:
 * · no material to verify → **503**, nothing processed (and the forge will re-deliver) ;
 * · token from another tenant → **401**, nothing processed ;
 * · delivery already seen → acknowledged without being replayed.
 */

process.env.GIT_TOKEN_ENCRYPTION_SECRET = "test-secret-for-forge-envelopes-32ch";

interface Row extends Record<string, unknown> {}

let linkRows: Row[] = [];
/** Delivery identifiers already registered — basic anti-replay. */
let deliveries: string[] = [];

function linksTable() {
  const filters: ((row: Row) => boolean)[] = [];
  const query: Record<string, unknown> = {};
  const matching = () => linkRows.filter((row) => filters.every((f) => f(row)));
  let patch: Record<string, unknown> | null = null;
  query.select = () => query;
  query.eq = (column: string, value: unknown) => {
    filters.push((row) => row[column] === value);
    return query;
  };
  query.is = () => query;
  query.in = () => query;
  query.update = (values: Record<string, unknown>) => {
    patch = values;
    return query;
  };
  query.maybeSingle = async () => ({ data: matching()[0] ?? null, error: null });
  query.then = (onFulfilled: (value: unknown) => unknown) => {
    const rows = matching();
    if (patch) for (const row of rows) Object.assign(row, patch);
    return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
  };
  return query;
}

/** The anti-replay table: it is the primary key which guards (23505). */
function deliveriesTable() {
  return {
    insert: async (row: { provider: string; delivery_id: string }) => {
      const key = `${row.provider}:${row.delivery_id}`;
      if (deliveries.includes(key)) {
        return { error: { code: "23505", message: "duplicate key" } };
      }
      deliveries.push(key);
      return { error: null };
    },
  };
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (name: string) =>
      name === "forge_webhook_deliveries" ? deliveriesTable() : linksTable(),
  }),
}));

/** The real work of the receiver, reduced to a probe: has it been done? */
const syncRemoteIssueEvent = vi.fn(async () => {});
const syncGithubIssueComment = vi.fn(async () => {});
const syncGithubIssueDependency = vi.fn(async () => {});
vi.mock("@/lib/server/git/issue-sync", () => ({
  syncRemoteIssueEvent: (...a: unknown[]) => syncRemoteIssueEvent(...(a as [])),
  syncGithubIssueComment: (...a: unknown[]) => syncGithubIssueComment(...(a as [])),
  syncGithubIssueDependency: (...a: unknown[]) => syncGithubIssueDependency(...(a as [])),
}));

const rotateGitlabWebhookSecret = vi.fn(async () => {});
vi.mock("@/lib/server/git/gitlab-app", () => ({
  rotateGitlabWebhookSecret: (...a: unknown[]) =>
    rotateGitlabWebhookSecret(...(a as [])),
}));

const verifyGithubSignature = vi.fn(() => true);
vi.mock("@/lib/server/git/github-app", () => ({
  verifyGithubSignature: (...a: unknown[]) => verifyGithubSignature(...(a as [])),
}));

vi.mock("@/lib/server/after-safe", () => ({
  afterOrNow: (fn: () => Promise<unknown>) => {
    void fn();
  },
}));

vi.mock("@/lib/server/agent/runs", () => ({
  syncPrState: async () => [],
  findRunsForPr: async () => [],
}));
vi.mock("@/lib/server/agent/issue-status-sync", () => ({
  syncIssueStatusFromPr: async () => {},
}));
vi.mock("@/lib/server/agent/pr-activity", () => ({
  applyForgePrToIssue: async () => {},
  isPrActionEcho: async () => false,
  recordForgePrActionEvents: async () => {},
  recordForgePrGesture: async () => {},
  notifyForgePrAction: async () => {},
}));
vi.mock("@/lib/server/agent/pr-opened-notify", () => ({
  notifyPullRequestOpened: async () => {},
}));
const findPullRequestByNumber = vi.fn(async (): Promise<Record<string, unknown> | null> => null);
vi.mock("@/lib/server/agent/pull-requests", () => ({
  findPullRequestByNumber: (...a: unknown[]) => findPullRequestByNumber(...(a as [])),
  findPullRequestsByHeadSha: async () => [],
  resolveIssueForPr: async () => null,
  upsertPullRequest: async () => null,
}));
const handleForgeNumoMention = vi.fn(async () => {});
vi.mock("@/lib/server/agent/pr-mention", () => ({
  handleForgeNumoMention: (...a: unknown[]) => handleForgeNumoMention(...(a as [])),
}));
vi.mock("@/lib/server/agent/pr-live", () => ({
  broadcastPrChanged: () => {},
  broadcastPrChangedByNumber: async () => {},
}));

// Managed forge relay (docs/managed-forge-relay-plan.md): off by default in
// this file (self-hosted behavior); the fan-out suite flips it on.
let managedForge = false;
const enqueueRelayDeliveryForPayload = vi.fn(async (): Promise<string | null> => null);
vi.mock("@/lib/managed-services", () => ({
  isManagedForgeEnabled: () => managedForge,
}));
vi.mock("@/lib/server/forge-relay/fanout", () => ({
  enqueueRelayDeliveryForPayload: (...args: unknown[]) =>
    enqueueRelayDeliveryForPayload(...(args as [])),
}));

const { ensureRepoWebhookSecret } = await import(
  "@/lib/server/git/webhook-secret"
);
const { POST: gitlabPOST } = await import("@/app/api/webhooks/gitlab/route");
const { POST: githubPOST } = await import("@/app/api/webhooks/github/route");

const GITLAB_ISSUE = {
  object_kind: "issue",
  project: { id: 1001, path_with_namespace: "acme/app" },
  object_attributes: { iid: 7, title: "Une issue", action: "open", state: "opened" },
};

const GITHUB_ISSUE = {
  action: "opened",
  issue: { number: 7, title: "Une issue", state: "open" },
  repository: { id: 9001, full_name: "acme/app" },
};

function gitlabRequest(
  token: string | null,
  opts: { deliveryId?: string; body?: unknown } = {},
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token !== null) headers.set("x-gitlab-token", token);
  headers.set("x-gitlab-event-uuid", opts.deliveryId ?? crypto.randomUUID());
  return new Request("https://minddy.app/api/webhooks/gitlab", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? GITLAB_ISSUE),
  }) as unknown as Parameters<typeof gitlabPOST>[0];
}

function githubRequest(
  opts: { deliveryId?: string; event?: string; body?: unknown } = {},
) {
  return new Request("https://minddy.app/api/webhooks/github", {
    method: "POST",
    headers: new Headers({
      "content-type": "application/json",
      "x-github-event": opts.event ?? "issues",
      "x-hub-signature-256": "sha256=whatever",
      "x-github-delivery": opts.deliveryId ?? crypto.randomUUID(),
    }),
    body: JSON.stringify(opts.body ?? GITHUB_ISSUE),
  }) as unknown as Parameters<typeof githubPOST>[0];
}

function link(overrides: Row = {}): Row {
  return {
    id: "link-1",
    project_id: "project-1",
    provider: "gitlab",
    connection_id: "conn-1",
    external_repo_id: "1001",
    repo_full_name: "acme/app",
    issue_sync_enabled: true,
    webhook_secret_encrypted: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyGithubSignature.mockReturnValue(true);
  managedForge = false;
  enqueueRelayDeliveryForPayload.mockResolvedValue(null);
  linkRows = [link()];
  deliveries = [];
  process.env.GIT_TOKEN_ENCRYPTION_SECRET = "test-secret-for-forge-envelopes-32ch";
  delete process.env.GITLAB_WEBHOOK_SECRET;
  process.env.GITHUB_WEBHOOK_SECRET = "github-app-secret";
  delete process.env.MINDDY_FORGE_RELAY_WEBHOOK_SECRET;
});

describe("POST /api/webhooks/gitlab", () => {
  it("no material to verify → 503, nothing processed", async () => {
    delete process.env.GIT_TOKEN_ENCRYPTION_SECRET;
    const response = await gitlabPOST(gitlabRequest("n'importe quoi"));
    expect(response.status).toBe(503);
    expect(syncRemoteIssueEvent).not.toHaveBeenCalled();
  });

  it("le jeton d'un AUTRE dépôt → 401, rien traité", async () => {
    linkRows = [
      link({ id: "link-a", project_id: "project-a", external_repo_id: "1001" }),
      link({ id: "link-b", project_id: "project-b", external_repo_id: "2002" }),
    ];
    await ensureRepoWebhookSecret({ provider: "gitlab", externalRepoId: "1001" });
    const other = await ensureRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "2002",
    });

    // The maintainer of repository 2002 reads his token at home and signs for 1001.
    const response = await gitlabPOST(gitlabRequest(other));
    expect(response.status).toBe(401);
    expect(syncRemoteIssueEvent).not.toHaveBeenCalled();
  });

  it("repository token → 200, and the issue is synchronized", async () => {
    const secret = await ensureRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    const response = await gitlabPOST(gitlabRequest(secret));
    expect(response.status).toBe(200);
    expect(syncRemoteIssueEvent).toHaveBeenCalledTimes(1);
    expect(rotateGitlabWebhookSecret).not.toHaveBeenCalled();
  });

  it("un jeton absent → 401", async () => {
    await ensureRepoWebhookSecret({ provider: "gitlab", externalRepoId: "1001" });
    const response = await gitlabPOST(gitlabRequest(null));
    expect(response.status).toBe(401);
    expect(syncRemoteIssueEvent).not.toHaveBeenCalled();
  });

  it("a hook still using the global secret: processed, THEN rotated", async () => {
    process.env.GITLAB_WEBHOOK_SECRET = "legacy-global-secret";
    const response = await gitlabPOST(gitlabRequest("legacy-global-secret"));
    expect(response.status).toBe(200);
    // The processing passes: refusing would cut the synchronization of the deposits linked before
    // this version, time for a rotation that they haven't had yet.
    expect(syncRemoteIssueEvent).toHaveBeenCalledTimes(1);
    expect(rotateGitlabWebhookSecret).toHaveBeenCalledWith({
      externalRepoId: "1001",
      connectionId: "conn-1",
    });
  });

  it("a delivery already seen is not replayed", async () => {
    const secret = await ensureRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    const deliveryId = "livraison-1";
    await gitlabPOST(gitlabRequest(secret, { deliveryId }));
    const replay = await gitlabPOST(gitlabRequest(secret, { deliveryId }));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ ok: true, duplicate: true });
    expect(syncRemoteIssueEvent).toHaveBeenCalledTimes(1);
  });

  it("a payload without an identifiable repository → 400", async () => {
    const response = await gitlabPOST(
      gitlabRequest("peu importe", { body: { object_kind: "issue" } }),
    );
    expect(response.status).toBe(400);
    expect(syncRemoteIssueEvent).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/github", () => {
  it("missing secret → 503, nothing processed", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const response = await githubPOST(githubRequest());
    expect(response.status).toBe(503);
    expect(syncRemoteIssueEvent).not.toHaveBeenCalled();
  });

  it("invalid signature → 401, nothing processed", async () => {
    verifyGithubSignature.mockReturnValue(false);
    const response = await githubPOST(githubRequest());
    expect(response.status).toBe(401);
    expect(syncRemoteIssueEvent).not.toHaveBeenCalled();
  });

  it("a delivery already seen is not replayed", async () => {
    const deliveryId = "livraison-gh-1";
    await githubPOST(githubRequest({ deliveryId }));
    const replay = await githubPOST(githubRequest({ deliveryId }));
    expect(await replay.json()).toEqual({ ok: true, duplicate: true });
    expect(syncRemoteIssueEvent).toHaveBeenCalledTimes(1);
  });

  it("synchronizes a regular issue comment without treating it as a PR comment", async () => {
    const response = await githubPOST(
      githubRequest({
        event: "issue_comment",
        body: {
          action: "created",
          repository: { id: 9001, full_name: "acme/app" },
          issue: { number: 7 },
          comment: {
            id: 22,
            body: "I can reproduce this.",
            user: { login: "octocat" },
            created_at: "2026-08-19T12:00:00Z",
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(syncGithubIssueComment).toHaveBeenCalledWith(
      expect.objectContaining({ remoteCommentId: "22", number: 7 }),
    );
  });

  it("synchronizes a GitHub blocking dependency", async () => {
    const response = await githubPOST(
      githubRequest({
        event: "issue_dependencies",
        body: {
          action: "blocked_by_added",
          repository: { id: 9001 },
          blocked_issue: { number: 8 },
          blocking_issue: { number: 7 },
          blocking_issue_repo: { id: 9001 },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(syncGithubIssueDependency).toHaveBeenCalledWith(
      expect.objectContaining({ blockingNumber: 7, blockedNumber: 8 }),
    );
  });
});

describe("POST /api/webhooks/github — relayed deliveries", () => {
  function relayedRequest(opts: { deliveryId?: string } = {}) {
    return new Request("https://minddy.app/api/webhooks/github", {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        "x-github-event": "issue_comment",
        "x-hub-signature-256": "sha256=whatever",
        "x-github-delivery": opts.deliveryId ?? crypto.randomUUID(),
        "x-minddy-relay": "1",
      }),
      body: JSON.stringify(GITHUB_ISSUE),
    }) as unknown as Parameters<typeof githubPOST>[0];
  }

  it("verifies a relayed delivery against the RELAY secret, never the local app one", async () => {
    process.env.MINDDY_FORGE_RELAY_WEBHOOK_SECRET = "relay-webhook-secret";
    await githubPOST(relayedRequest());
    expect(verifyGithubSignature).toHaveBeenCalledWith(
      expect.any(String),
      "sha256=whatever",
      "relay-webhook-secret",
    );
  });

  it("keeps verifying DIRECT deliveries against GITHUB_WEBHOOK_SECRET", async () => {
    process.env.MINDDY_FORGE_RELAY_WEBHOOK_SECRET = "relay-webhook-secret";
    await githubPOST(githubRequest());
    expect(verifyGithubSignature).toHaveBeenCalledWith(
      expect.any(String),
      "sha256=whatever",
      "github-app-secret",
    );
  });

  it("fails closed for a relayed delivery when only the local app secret exists", async () => {
    // The editions rule: relay mode reads ONLY relay variables.
    const response = await githubPOST(relayedRequest());
    expect(response.status).toBe(503);
    expect(syncRemoteIssueEvent).not.toHaveBeenCalled();
  });

  it("fans out to the claiming instance on Cloud and skips local processing", async () => {
    managedForge = true;
    enqueueRelayDeliveryForPayload.mockResolvedValue("instance-1");
    const response = await githubPOST(githubRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, relayed: true });
    expect(enqueueRelayDeliveryForPayload).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "github" }),
    );
    expect(syncRemoteIssueEvent).not.toHaveBeenCalled();
  });

  it("answers 503 WITHOUT marking the dedup when the fan-out enqueue fails", async () => {
    // The failure window: a 200 here (or a dedup mark before the enqueue)
    // would make GitHub's re-delivery land as a "replay" — event lost.
    managedForge = true;
    enqueueRelayDeliveryForPayload.mockRejectedValue(
      new Error("relay delivery enqueue failed: connection failure"),
    );
    const response = await githubPOST(githubRequest({ deliveryId: "livraison-gh-err" }));
    expect(response.status).toBe(503);
    expect(deliveries).toHaveLength(0);

    // The forge re-delivers once the queue is back: processed fresh.
    enqueueRelayDeliveryForPayload.mockResolvedValue(null);
    const retry = await githubPOST(githubRequest({ deliveryId: "livraison-gh-err" }));
    expect(retry.status).toBe(200);
    expect(syncRemoteIssueEvent).toHaveBeenCalledTimes(1);
  });

  it("processes unclaimed installations locally even with the managed forge on", async () => {
    managedForge = true;
    enqueueRelayDeliveryForPayload.mockResolvedValue(null);
    const response = await githubPOST(githubRequest());
    expect(response.status).toBe(200);
    expect(syncRemoteIssueEvent).toHaveBeenCalledTimes(1);
  });

  it("triggers the @numo review from a verified relayed mention (end-to-end chain)", async () => {
    // The full Phase-4 promise: a relayed `@numo` mention reaches the instance
    // receiver and triggers the agent exactly like a direct delivery.
    process.env.MINDDY_FORGE_RELAY_WEBHOOK_SECRET = "relay-webhook-secret";
    findPullRequestByNumber.mockResolvedValue({
      id: "pr-1",
      issue_id: "issue-1",
      number: 7,
      repo_full_name: "acme/app",
    });

    const response = await githubPOST(
      new Request("https://minddy.app/api/webhooks/github", {
        method: "POST",
        headers: new Headers({
          "content-type": "application/json",
          "x-github-event": "issue_comment",
          "x-hub-signature-256": "sha256=whatever",
          "x-github-delivery": crypto.randomUUID(),
          "x-minddy-relay": "1",
        }),
        body: JSON.stringify({
          action: "created",
          repository: { id: 9001, full_name: "acme/app" },
          issue: { number: 7, pull_request: { url: "https://github.com/acme/app/pull/7" } },
          comment: {
            id: 22,
            body: "@numo what happened here?",
            user: { login: "octocat" },
            created_at: "2026-08-19T12:00:00Z",
          },
        }),
      }) as unknown as Parameters<typeof githubPOST>[0],
    );

    expect(response.status).toBe(200);
    expect(handleForgeNumoMention).toHaveBeenCalledTimes(1);
  });
});

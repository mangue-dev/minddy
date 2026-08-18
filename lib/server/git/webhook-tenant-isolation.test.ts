import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteIssue } from "@/lib/server/git/issue-sync-core";

/**
 * The partitioning of forge webhook receivers (MIN-333).
 *
 * Two faults, one file: they both fell from the same place —
 * the receiver believed what the payload said about itself.
 *
 * 1. **The GitLab secret was global.** The same token was written in the hook
 * of each tenant, and GitLab SHOWS the token of a hook to anyone who can
 * edit it: any maintainer of a linked repository could read it at home, then
 * sign events for others' repositories. The secret is now
 * specific to the deposit - that of a tenant does not sign anything with his neighbor.
 * 2. **The deposit was resolved by its NAME.** A name is released at the forge as soon as
 * which is renamed, and reallocated to whoever asks: the buyer of a name
 * inherited tickets from its former holder. Routing passes to the numeric id
 *, which is never reallocated.
 *
 * The two halves test together because they hold together: the secret
 * is searched by repository id, and the fan-out too.
 */

process.env.GIT_TOKEN_ENCRYPTION_SECRET = "test-secret-for-forge-envelopes-32ch";

interface Row extends Record<string, unknown> {}

let linkRows: Row[] = [];
let issueRows: Row[] = [];
/** Tickets created — the fan-out probe: who received the remote issue? */
let creates: Record<string, unknown>[] = [];

/**
 * PostgREST table duplicate, reduced to what this file exerts: `eq`, `is`,
 * `in`, plus a `update` which ACTUALLY writes to the lines (the rotation of
 * secret then reads, that's the whole point).
 */
function table(rows: () => Row[]) {
  const filters: ((row: Row) => boolean)[] = [];
  const matching = () => rows().filter((row) => filters.every((f) => f(row)));
  const query: Record<string, unknown> = {};
  query.select = () => query;
  query.eq = (column: string, value: unknown) => {
    filters.push((row) => row[column] === value);
    return query;
  };
  query.is = (column: string, value: unknown) => {
    filters.push((row) => (row[column] ?? null) === value);
    return query;
  };
  query.in = (column: string, values: unknown[]) => {
    filters.push((row) => values.includes(row[column]));
    return query;
  };
  // `update` is deferred until await: the filters arrive AFTER it
  // (`.update(patch).eq(...)`), comme chez PostgREST.
  let patch: Record<string, unknown> | null = null;
  query.update = (values: Record<string, unknown>) => {
    patch = values;
    return query;
  };
  query.insert = async () => ({ error: null });
  query.maybeSingle = async () => ({ data: matching()[0] ?? null, error: null });
  query.then = (onFulfilled: (value: unknown) => unknown) => {
    const rows = matching();
    if (patch) for (const row of rows) Object.assign(row, patch);
    return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
  };
  return query;
}

const TABLES: Record<string, () => Row[]> = {
  project_git_links: () => linkRows,
  issues: () => issueRows,
  issue_categories: () => [],
};

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (name: string) => table(TABLES[name] ?? (() => [])),
  }),
}));

vi.mock("@/lib/server/create-issue", () => ({
  createIssueForProject: async (args: Record<string, unknown>) => {
    creates.push(args);
    return { ok: true, issue: { id: "issue-new" } };
  },
}));
vi.mock("@/lib/server/update-issue", () => ({
  updateIssueFields: async () => ({ ok: true }),
}));
vi.mock("@/lib/server/set-issue-categories", () => ({
  setIssueCategories: async () => ({ ok: true, categoryIds: [] }),
}));
vi.mock("@/lib/server/categories", () => ({
  categoryKey: (name: string) => name.trim().toLowerCase(),
  resolveCategoryIdsByName: async () => ({ idByKey: new Map(), created: 0 }),
}));
vi.mock("@/lib/server/git/forge-members", () => ({
  buildForgeAssigneeIndex: async () => new Map(),
  matchForgeAssignee: () => null,
}));
vi.mock("@/lib/server/import-issues", () => ({
  importIssuesIntoProject: async () => ({ ok: true, result: { created: 0 } }),
}));
vi.mock("@/lib/server/entitlements", () => ({ ensureIssueLimit: async () => {} }));
vi.mock("@/lib/server/plan-limit-error", () => ({ isPlanLimitError: () => false }));
vi.mock("@/lib/server/git/github-app", () => ({ listRepoOpenIssues: async () => [] }));
vi.mock("@/lib/server/git/gitlab-app", () => ({
  getGitlabAccessToken: async () => "gitlab-token",
  listGitlabOpenIssues: async () => [],
}));

const {
  ensureRepoWebhookSecret,
  loadWebhookSecrets,
  rotateRepoWebhookSecret,
  verifyWebhookToken,
  webhookSecretMatches,
} = await import("@/lib/server/git/webhook-secret");
const { listIssueSyncTargets, syncRemoteIssueEvent } = await import(
  "@/lib/server/git/issue-sync"
);

/** A binding, such as `project_git_links` carries it. */
function link(overrides: Row = {}): Row {
  return {
    id: "link-1",
    project_id: "project-1",
    provider: "gitlab",
    connection_id: "conn-1",
    installation_id: null,
    external_repo_id: "1001",
    repo_full_name: "acme/app",
    repo_owner: "acme",
    repo_name: "app",
    created_by: "user-owner",
    issue_sync_enabled: true,
    webhook_secret_encrypted: null,
    ...overrides,
  };
}

function remote(overrides: Partial<RemoteIssue> = {}): RemoteIssue {
  return {
    provider: "gitlab",
    repoFullName: "acme/app",
    repoId: "1001",
    number: 7,
    title: "Une issue",
    body: null,
    url: null,
    action: "open",
    actorLogin: null,
    state: "open",
    labels: [],
    assigneeLogins: [],
    ...overrides,
  };
}

beforeEach(() => {
  linkRows = [];
  issueRows = [];
  creates = [];
  delete process.env.GITLAB_WEBHOOK_SECRET;
});

describe("webhook secret per repository", () => {
  it("mints a repository-specific secret and stores it encrypted", async () => {
    linkRows = [link()];
    const secret = await ensureRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "1001",
    });

    expect(secret).toHaveLength(64);
    const stored = linkRows[0].webhook_secret_encrypted as string;
    // Encrypted, not in plain text: the column must never carry the readable token.
    expect(stored).toBeTruthy();
    expect(stored).not.toContain(secret);
    // Reread does not regenerate: the hook installed at GitLab carries THIS value.
    await expect(
      ensureRepoWebhookSecret({ provider: "gitlab", externalRepoId: "1001" }),
    ).resolves.toBe(secret);
  });

  it("two repositories, two secrets — neither one signs for the other", async () => {
    linkRows = [
      link({ id: "link-a", project_id: "project-a", external_repo_id: "1001" }),
      link({ id: "link-b", project_id: "project-b", external_repo_id: "2002" }),
    ];
    const a = await ensureRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    const b = await ensureRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "2002",
    });
    expect(a).not.toBe(b);

    // THE flaw of MIN-333, in its shortest form: the maintainer of
    // repository A reads its own token in its hook settings, and uses it
    // to sign an event intended for repository B.
    const candidatesB = await loadWebhookSecrets({
      provider: "gitlab",
      externalRepoId: "2002",
    });
    expect(verifyWebhookToken(a, candidatesB)).toBe("rejected");
    expect(verifyWebhookToken(b, candidatesB)).toBe("own");
  });

  it("two projects on the SAME repository share the secret — they share the hook", async () => {
    linkRows = [
      link({ id: "link-a", project_id: "project-a" }),
      link({ id: "link-b", project_id: "project-b" }),
    ];
    const first = await ensureRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    // Generating a second one would invalidate the neighbor's hook: at GitLab, the hook
    // lives on the depot, there is only one.
    expect(linkRows.map((r) => r.webhook_secret_encrypted)).toEqual([
      linkRows[0].webhook_secret_encrypted,
      linkRows[0].webhook_secret_encrypted,
    ]);
    const candidates = await loadWebhookSecrets({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    expect(candidates.own).toEqual([first]);
  });

  it("the global fallback is recognized as such so it can be rotated", async () => {
    process.env.GITLAB_WEBHOOK_SECRET = "legacy-global-secret";
    linkRows = [link()];
    const candidates = await loadWebhookSecrets({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    // A hook placed before MIN-333 still carries the old token: refuse it
    // would cut the sync for one rotation.
    expect(verifyWebhookToken("legacy-global-secret", candidates)).toBe("legacy");
    expect(candidates.connectionId).toBe("conn-1");
    expect(verifyWebhookToken("n'importe quoi", candidates)).toBe("rejected");
  });

  it("without a deployed fallback, a repository without a secret accepts nothing", async () => {
    linkRows = [link()];
    const candidates = await loadWebhookSecrets({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    expect(candidates.own).toEqual([]);
    expect(candidates.legacy).toBeNull();
    expect(verifyWebhookToken("", candidates)).toBe("rejected");
    expect(verifyWebhookToken(null, candidates)).toBe("rejected");
  });

  it("rotation replaces the secret for ALL repository links", async () => {
    linkRows = [
      link({ id: "link-a", project_id: "project-a" }),
      link({ id: "link-b", project_id: "project-b" }),
    ];
    const before = await ensureRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    const after = await rotateRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    expect(after).not.toBe(before);
    const candidates = await loadWebhookSecrets({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    expect(candidates.own).toEqual([after]);
  });

  it("compares in constant time and rejects a prefix", () => {
    expect(webhookSecretMatches("abc", "abc")).toBe(true);
    expect(webhookSecretMatches("ab", "abc")).toBe(false);
    expect(webhookSecretMatches("abcd", "abc")).toBe(false);
    expect(webhookSecretMatches(null, "abc")).toBe(false);
  });
});

describe("repository routing by identifier", () => {
  it("routes by id even when the repository was renamed on the forge", async () => {
    linkRows = [link({ repo_full_name: "acme/ancien-nom" })];

    const targets = await listIssueSyncTargets({
      provider: "gitlab",
      repoId: "1001",
    });
    expect(targets.map((t) => t.projectId)).toEqual(["project-1"]);

    await syncRemoteIssueEvent(remote({ repoFullName: "acme/nouveau-nom" }));
    expect(creates).toHaveLength(1);
    expect(creates[0].projectId).toBe("project-1");
  });

  it("does NOT route a repository that took another's name", async () => {
    // The heart of the defect: `acme/app` was released by its bearer, and someone
    // someone else took it over. His deposit has another id — so nothing.
    linkRows = [link({ external_repo_id: "1001", repo_full_name: "acme/app" })];

    await syncRemoteIssueEvent(remote({ repoId: "9999", repoFullName: "acme/app" }));
    expect(creates).toEqual([]);
  });

  it("the stored name follows the rename — it is only for display now", async () => {
    linkRows = [link({ repo_full_name: "acme/ancien", repo_owner: "acme" })];
    await syncRemoteIssueEvent(remote({ repoFullName: "nouvelle-org/app" }));
    expect(linkRows[0].repo_full_name).toBe("nouvelle-org/app");
    expect(linkRows[0].repo_owner).toBe("nouvelle-org");
    // `repo_name` is a DISPLAY name on the GitLab side, that the payload of a
    // issue does not carry: we do not rewrite what we cannot say correctly.
    expect(linkRows[0].repo_name).toBe("app");
  });

  it("serves only links whose sync is ACTIVE", async () => {
    linkRows = [link({ issue_sync_enabled: false })];
    await syncRemoteIssueEvent(remote());
    expect(creates).toEqual([]);
  });
});

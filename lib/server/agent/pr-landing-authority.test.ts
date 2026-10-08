import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";
import { encodeAgentWorkBranch } from "./run-work-branch-content";

const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.alloc(32, 47) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.alloc(32, 47) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => store,
  getBlindIndexKeys: () => ({ current: async () => ({ version: 1, bytes: Buffer.alloc(32, 85) }) }),
}));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const h = vi.hoisted(() => ({
  member: true,
  binding: true,
  run: null as Record<string, unknown> | null,
  issueIds: [] as string[],
  syncStatus: vi.fn(async (_input: { issueId: string; actorId: string; prState: string }) => {}),
  events: vi.fn(async () => {}),
  comments: vi.fn(async () => ({})),
}));

vi.mock("./pull-requests", async (original) => ({
  ...(await original<typeof import("./pull-requests")>()),
  upsertPullRequest: vi.fn(async () => ({ id: "pr-1" })),
  pullRequestIssueIds: vi.fn(async () => h.issueIds),
}));
vi.mock("./issue-status-sync", () => ({ syncIssueStatusFromPr: h.syncStatus }));
vi.mock("./pr-opened-notify", () => ({ notifyPullRequestOpened: vi.fn(async () => {}) }));
vi.mock("@/lib/server/issue-events", () => ({ insertEvents: h.events }));
vi.mock("@/lib/server/comment-store", () => ({ commentStore: () => ({ insert: h.comments }) }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));

vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: vi.fn(async () =>
    h.member ? { isMember: true, isOwner: false, project: {} } : null,
  ),
}));

vi.mock("./runs", () => ({
  getRun: vi.fn(async () => h.run),
  runRepoBindingIsCurrent: vi.fn(async () => h.binding),
  stampRun: vi.fn(async () => h.run),
}));

import {
  assertPrLandingAuthority,
  openPullRequestAfterPush,
  PrLandingAuthorityError,
  registerPr,
  type PrLandingContext,
} from "./pr-landing";

const RUN_ID = "11111111-2222-4333-8444-555555555555";

function context() {
  const ensurePullRequest = vi.fn(async () => ({
    number: 1,
    url: "https://github.test/acme/app/pull/1",
    state: "open",
  }));
  const target = {
    provider: "github" as const,
    repoFullName: "acme/app",
    defaultBranch: "main",
    remoteUrl: "https://github.test/acme/app.git",
    authUrl: "https://token@github.test/acme/app.git",
    token: "token",
    linkId: "link-1",
    connectionId: "connection-1",
    externalRepoId: "9001",
  };
  const ctx = {
    run: h.run,
    target,
    forge: { ensurePullRequest },
    issue: null,
    workBranch: `minddy/agent/agent-${RUN_ID.slice(0, 8)}`,
    baseBranch: "main",
    locale: "en",
    emit: vi.fn(async () => {}),
    prState: { number: null, url: null, state: null },
  } as unknown as PrLandingContext;
  return { ctx, target, ensurePullRequest };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.issueIds = [];
  h.member = true;
  h.binding = true;
  h.run = {
    id: RUN_ID,
    status: "running",
    created_by: "user-1",
    project_id: "project-1",
    repo_link_id: "link-1",
    connection_id: "connection-1",
    repo_provider: "github",
    repo_external_id: "9001",
    branch_name: null,
    issue_id: null,
  };
});

describe("PR landing issue status synchronization", () => {
  it.each(["opened", "reopened"] as const)("updates all linked issues for a notebook PR that is %s", async (kind) => {
    h.issueIds = ["issue-a", "issue-b", "issue-c"];
    const { ctx } = context();
    await registerPr(ctx, { number: 1, url: "https://github.test/acme/app/pull/1", state: "open" }, kind);
    expect(h.syncStatus.mock.calls).toEqual(h.issueIds.map((issueId) => [{
      issueId, actorId: "user-1", prState: "open",
    }]));
    expect(h.events).not.toHaveBeenCalled();
    expect(h.comments).not.toHaveBeenCalled();
  });

  it("synchronizes draft state without reviving a detached run issue", async () => {
    h.run!.issue_id = "issue-detached";
    h.issueIds = ["issue-b", "issue-c"];
    const { ctx } = context();
    ctx.issue = { identifier: "MIN-1" };
    await registerPr(ctx, { number: 1, url: "https://github.test/acme/app/pull/1", state: "open", draft: true }, "reopened");
    expect(h.syncStatus.mock.calls).toEqual(h.issueIds.map((issueId) => [{
      issueId, actorId: "user-1", prState: "draft",
    }]));
    expect(h.events).not.toHaveBeenCalled();
    expect(h.comments).not.toHaveBeenCalled();
  });

  it("preserves anchor activity and comments while synchronizing additional issues", async () => {
    h.run!.issue_id = "issue-a";
    h.issueIds = ["issue-a", "issue-b"];
    const { ctx } = context();
    ctx.issue = { identifier: "MIN-1" };
    await registerPr(ctx, { number: 1, url: "https://github.test/acme/app/pull/1", state: "open" }, "reopened");
    expect(h.syncStatus).toHaveBeenCalledTimes(2);
    expect(h.events).toHaveBeenCalledTimes(1);
    expect(h.comments).toHaveBeenCalledTimes(1);
  });

  it("skips synchronization when the PR has no linked issues", async () => {
    const { ctx } = context();
    await registerPr(ctx, { number: 1, url: "https://github.test/acme/app/pull/1", state: "open" }, "opened");
    expect(h.syncStatus).not.toHaveBeenCalled();
  });
});

describe("PR landing authority", () => {
  it.each([
    `minddy/agent/agent-${RUN_ID.slice(0, 8)}`,
    "numo/numo-delegation-version-1-objective-audit-hebdomadaire-du-serveur-mcp-de-2f3336f1",
  ])("opens a PR after a prior push persisted the encrypted working branch %s", async (branch) => {
    const { ctx, target, ensurePullRequest } = context();
    ctx.workBranch = branch;
    h.run!.branch_name = await encodeAgentWorkBranch("project-1", RUN_ID, ctx.workBranch);
    await openPullRequestAfterPush(ctx, {
      pushed: { pushed: true, remoteUpdated: true, headSha: "abc" },
      prTitle: "Agent work", fresh: target, jobsNote: "", noteBranchPushed: async () => {},
    });
    expect(ensurePullRequest).toHaveBeenCalledOnce();
    expect(ensurePullRequest.mock.calls[0]).toEqual([expect.objectContaining({ head: ctx.workBranch })]);
  });

  it.each([false, true])("reports expected and received branches for a mismatch (encrypted: %s)", async (encrypted) => {
    const { ctx } = context();
    h.run!.branch_name = encrypted
      ? await encodeAgentWorkBranch("project-1", RUN_ID, "numo/expected")
      : "numo/expected";
    await expect(assertPrLandingAuthority(ctx)).rejects.toThrow(
      `expected "numo/expected", received ${JSON.stringify(ctx.workBranch)}`,
    );
  });

  it("fails closed without exposing malformed ciphertext", async () => {
    h.run!.branch_name = "mdyw3:private-malformed-ciphertext";
    await expect(assertPrLandingAuthority(context().ctx)).rejects.toThrow("unable to decode the run's working branch");
  });

  it("rechecks an encrypted branch binding changed during the push", async () => {
    const { ctx, target, ensurePullRequest } = context();
    await expect(openPullRequestAfterPush(ctx, {
      pushed: { pushed: true, remoteUpdated: true, headSha: "abc" },
      prTitle: "Agent work", fresh: target, jobsNote: "",
      noteBranchPushed: async () => { h.run!.branch_name = await encodeAgentWorkBranch("project-1", RUN_ID, "numo/rebound"); },
    })).rejects.toThrow('expected "numo/rebound"');
    expect(ensurePullRequest).not.toHaveBeenCalled();
  });

  it("accepts the current member and immutable repository identity", async () => {
    await expect(assertPrLandingAuthority(context().ctx)).resolves.toMatchObject({ id: RUN_ID });
  });

  it("rejects membership and repository rebinding", async () => {
    h.member = false;
    await expect(assertPrLandingAuthority(context().ctx)).rejects.toThrow(
      "run owner no longer has project access",
    );

    h.member = true;
    h.binding = false;
    await expect(assertPrLandingAuthority(context().ctx)).rejects.toThrow(
      "run repository binding has changed",
    );
  });

  it("rechecks after the push callback and never creates a PR after revocation", async () => {
    const { ctx, target, ensurePullRequest } = context();
    await expect(
      openPullRequestAfterPush(ctx, {
        pushed: { pushed: true, remoteUpdated: true, headSha: "abc" },
        prTitle: "Agent work",
        fresh: target,
        jobsNote: "",
        noteBranchPushed: async () => {
          h.member = false;
        },
      }),
    ).rejects.toBeInstanceOf(PrLandingAuthorityError);
    expect(ensurePullRequest).not.toHaveBeenCalled();
  });
});

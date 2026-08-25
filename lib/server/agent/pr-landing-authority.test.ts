import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  member: true,
  binding: true,
  run: null as Record<string, unknown> | null,
}));

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

describe("PR landing authority", () => {
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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  connectionInstallationId: null as number | null,
  canAccessProject: true,
  mint: vi.fn(async () => ({ token: "repository-token" })),
}));

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({ ok: true, user: { id: "reader" }, supabase: {} }),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: async () => h.canAccessProject ? { role: "member" } : null,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        then: (resolve: (result: { data: unknown[] }) => unknown) => resolve({
          data: [{
            id: "link-1", project_id: "project-1", connection_id: "connection-1",
            provider: "github", installation_id: null, external_repo_id: "9001",
            repo_full_name: "acme/app", default_branch: "main",
            git_connections: {
              provider: "github", source: "local",
              installation_id: h.connectionInstallationId,
            },
          }],
        }),
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/server/git/repository-name-content", () => ({
  shouldProtectRepositoryNames: async () => false,
  decodeRepositoryName: async (_provider: string, name: string) => name,
}));
vi.mock("@/lib/server/git/default-branch-content", () => ({
  decodeDefaultBranch: async (_projectId: string, branch: string) => branch,
}));
vi.mock("@/lib/server/git/forge-provider", () => ({
  forgeProviderForConnection: () => ({ getInstallationToken: h.mint }),
}));
vi.mock("./pull-requests", async (importOriginal) => ({
  ...await importOriginal<typeof import("./pull-requests")>(),
  findPullRequest: async () => ({
    id: "pr-1", provider: "github", repo_full_name: "acme/app", number: 42,
  }),
}));

import { authorizePrRequest } from "./pr-actions";
import { GET as detail } from "@/app/api/pull-requests/[prId]/route";
import { GET as comments } from "@/app/api/pull-requests/[prId]/comments/route";
import { GET as commits } from "@/app/api/pull-requests/[prId]/commits/route";
import { GET as reviewComments } from "@/app/api/pull-requests/[prId]/review-comments/route";
import { GET as aiReview } from "@/app/api/pull-requests/[prId]/ai-review/route";

beforeEach(() => {
  h.connectionInstallationId = null;
  h.canAccessProject = true;
  h.mint.mockClear();
});

describe("PR reads without a GitHub installation (MIN-648)", () => {
  it.each([
    ["detail", detail],
    ["comments", comments],
    ["commits", commits],
    ["review-comments", reviewComments],
    ["ai-review", aiReview],
  ] as const)("returns a controlled denial for %s instead of an unhandled exception", async (_name, handler) => {
    const response = await handler(
      new NextRequest("https://minddy.example/api/pull-requests/pr-1"),
      { params: Promise.resolve({ prId: "pr-1" }) },
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Pull request not found" });
    expect(h.mint).not.toHaveBeenCalled();
  });

  it("authorizes a read using the installation of the bound connection", async () => {
    h.connectionInstallationId = 4242;
    const auth = await authorizePrRequest(
      new NextRequest("https://minddy.example/api/pull-requests/pr-1"), "pr-1",
    );
    expect(auth.ok).toBe(true);
    if (!auth.ok) throw new Error("Expected an authorized PR scope");
    expect(auth.scope.call).toEqual({ token: "repository-token", repoFullName: "acme/app", number: 42 });
    expect(h.mint).toHaveBeenCalledWith({
      installationId: 4242,
      scope: { repositoryIds: [9001], permissions: undefined },
    });
  });

  it("does not mint through a project the reader cannot access", async () => {
    h.connectionInstallationId = 4242;
    h.canAccessProject = false;
    const auth = await authorizePrRequest(
      new NextRequest("https://minddy.example/api/pull-requests/pr-1"), "pr-1",
    );
    expect(auth.ok).toBe(false);
    if (auth.ok) throw new Error("Expected an inaccessible PR");
    expect(auth.response.status).toBe(404);
    expect(h.mint).not.toHaveBeenCalled();
  });
});

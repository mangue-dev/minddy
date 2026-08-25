import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  installationCalls: [] as unknown[],
  gitlabCalls: [] as string[],
  fetchCalls: [] as Array<{ url: string; init: RequestInit | undefined }>,
  gitlabMintStatus: 201,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: h.row }) }),
      }),
    }),
  }),
}));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: vi.fn() }));
vi.mock("@/lib/server/git/forge-provider", () => ({
  forgeProviderForConnection: () => ({
    getInstallationToken: async (input: unknown) => {
      h.installationCalls.push(input);
      return { token: "github-short-lived-token" };
    },
    getGitlabAccessToken: async (connectionId: string) => {
      h.gitlabCalls.push(connectionId);
      return "gitlab-account-wide-token";
    },
  }),
}));
vi.mock("@/lib/server/git/gitlab-rest", () => ({
  GITLAB_HOST: "https://gitlab.com",
  GITLAB_API_BASE: "https://gitlab.com/api/v4",
  gitlabHeaders: (token: string) => ({ Authorization: `Bearer ${token}` }),
}));

import { resolveRepoCloneTarget } from "./repo-access";

beforeEach(() => {
  h.installationCalls.length = 0;
  h.gitlabCalls.length = 0;
  h.fetchCalls.length = 0;
  h.gitlabMintStatus = 201;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      h.fetchCalls.push({ url: String(url), init });
      return new Response(
        JSON.stringify(h.gitlabMintStatus === 201 ? { token: "gitlab-project-token" } : {}),
        { status: h.gitlabMintStatus, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
});

describe("sandbox repository credentials", () => {
  it.each([
    ["repo-read", { contents: "read" }],
    ["repo-write", { contents: "write" }],
  ] as const)("scopes GitHub %s access to the linked repository", async (access, permissions) => {
    h.row = {
      id: "link-1",
      provider: "github",
      connection_id: "connection-1",
      installation_id: 42,
      external_repo_id: "9001",
      repo_full_name: "acme/private-app",
      default_branch: "main",
      git_connections: { source: "local" },
    };

    const target = await resolveRepoCloneTarget("project-1", access);
    expect(h.installationCalls).toEqual([
      {
        installationId: 42,
        scope: { repositoryIds: [9001], permissions },
      },
    ]);
    expect(target?.remoteUrl).toBe("https://github.com/acme/private-app.git");
    expect(target?.remoteUrl).not.toContain("github-short-lived-token");
  });

  it.each([
    ["repo-read", ["read_repository"], 20],
    ["repo-write", ["write_repository"], 30],
  ] as const)("mints a repository-scoped GitLab token for %s", async (access, scopes, level) => {
    h.row = {
      id: "link-2",
      provider: "gitlab",
      connection_id: "connection-2",
      installation_id: null,
      external_repo_id: "12345",
      repo_full_name: "group/private-app",
      default_branch: "main",
      git_connections: { source: "local" },
    };

    const target = await resolveRepoCloneTarget("project-1", access);
    expect(h.gitlabCalls).toEqual(["connection-2"]);
    expect(target?.remoteUrl).toBe("https://gitlab.com/group/private-app.git");
    expect(target?.remoteUrl).not.toContain("gitlab-account-wide-token");
    expect(target?.authUrl).toContain("gitlab-project-token");
    expect(target?.authUrl).not.toContain("gitlab-account-wide-token");
    expect(h.fetchCalls).toHaveLength(1);
    expect(h.fetchCalls[0].url).toBe(
      "https://gitlab.com/api/v4/projects/12345/access_tokens",
    );
    expect(h.fetchCalls[0].init?.method).toBe("POST");
    expect(h.fetchCalls[0].init?.headers).toMatchObject({
      Authorization: "Bearer gitlab-account-wide-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(h.fetchCalls[0].init?.body))).toMatchObject({
      scopes,
      access_level: level,
      expires_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it("keeps full GitLab authority in trusted server operations only", async () => {
    h.row = {
      id: "link-2",
      provider: "gitlab",
      connection_id: "connection-2",
      installation_id: null,
      external_repo_id: "12345",
      repo_full_name: "group/private-app",
      default_branch: "main",
      git_connections: { source: "local" },
    };

    const target = await resolveRepoCloneTarget("project-1", "full");
    expect(target?.token).toBe("gitlab-account-wide-token");
    expect(h.fetchCalls).toHaveLength(0);
  });

  it("fails closed when GitLab cannot mint a project token", async () => {
    h.gitlabMintStatus = 403;
    h.row = {
      id: "link-2",
      provider: "gitlab",
      connection_id: "connection-2",
      installation_id: null,
      external_repo_id: "12345",
      repo_full_name: "group/private-app",
      default_branch: "main",
      git_connections: { source: "local" },
    };

    await expect(resolveRepoCloneTarget("project-1", "repo-read")).rejects.toThrow(
      "GitLab project token mint failed (403)",
    );
  });
});

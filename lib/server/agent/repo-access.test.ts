import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  rows: [] as Record<string, unknown>[],
  accessibleProjects: new Set<string>(),
  selectedColumns: [] as string[],
  providerSources: [] as (string | null)[],
  installationCalls: [] as unknown[],
  gitlabCalls: [] as string[],
  fetchCalls: [] as Array<{ url: string; init: RequestInit | undefined }>,
  gitlabMintStatus: 201,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: (columns: string) => {
        h.selectedColumns.push(columns);
        const query = {
          eq: () => query,
          maybeSingle: async () => ({ data: h.row }),
          then: (resolve: (result: { data: typeof h.rows }) => unknown) =>
            resolve({ data: h.rows }),
        };
        return query;
      },
    }),
  }),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: vi.fn(async (_userId: string, projectId: string) =>
    h.accessibleProjects.has(projectId) ? { role: "member" } : null),
}));
vi.mock("@/lib/server/git/repository-name-content", () => ({
  shouldProtectRepositoryNames: async () => false,
  decodeRepositoryName: async (_provider: string, name: string | null) => name,
}));
vi.mock("@/lib/server/git/forge-provider", () => ({
  forgeProviderForConnection: (source: string | null) => {
    h.providerSources.push(source);
    return {
      getInstallationToken: async (input: unknown) => {
        h.installationCalls.push(input);
        return { token: "github-short-lived-token" };
      },
      getGitlabAccessToken: async (connectionId: string) => {
        h.gitlabCalls.push(connectionId);
        return "gitlab-account-wide-token";
      },
    };
  },
}));
vi.mock("@/lib/server/git/gitlab-rest", () => ({
  GITLAB_HOST: "https://gitlab.com",
  GITLAB_API_BASE: "https://gitlab.com/api/v4",
  gitlabHeaders: (token: string) => ({ Authorization: `Bearer ${token}` }),
}));

import { resolveRepoCloneTarget, resolveRepoCloneTargetForRepo } from "./repo-access";

beforeEach(() => {
  h.installationCalls.length = 0;
  h.row = null;
  h.rows = [];
  h.accessibleProjects.clear();
  h.selectedColumns.length = 0;
  h.providerSources.length = 0;
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

function githubLink(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    project_id: "project-1",
    provider: "github",
    connection_id: "connection-1",
    installation_id: null,
    external_repo_id: "9001",
    repo_full_name: "acme/private-app",
    default_branch: "main",
    git_connections: { provider: "github", installation_id: null, source: "local" },
    ...overrides,
  };
}

describe("incomplete GitHub repository links", () => {
  it("limits CLI authentication to PR writes and content reads in the linked repository", async () => {
    h.row = githubLink({ installation_id: 4242 });
    expect(await resolveRepoCloneTarget("project-1", "github-cli")).not.toBeNull();
    expect(h.installationCalls).toEqual([{
      installationId: 4242,
      scope: { repositoryIds: [9001], permissions: { contents: "read", pull_requests: "write" } },
    }]);
  });

  it("never returns an account-wide GitLab token to the GitHub CLI relay", async () => {
    h.row = githubLink({ provider: "gitlab" });
    expect(await resolveRepoCloneTarget("project-1", "github-cli")).toBeNull();
    expect(h.gitlabCalls).toEqual([]);
  });
  it.each(["local", "relay"])("recovers the installation from the linked %s connection", async (source) => {
    h.row = githubLink({
      git_connections: { provider: "github", installation_id: 4242, source },
    });
    const target = await resolveRepoCloneTarget("project-1", "repo-read");
    expect(target?.connectionId).toBe("connection-1");
    expect(h.installationCalls).toEqual([{
      installationId: 4242,
      scope: { repositoryIds: [9001], permissions: { contents: "read" } },
    }]);
    expect(h.providerSources).toEqual([source]);
    expect(h.selectedColumns[0]).toContain("git_connections(source, provider, installation_id)");
  });

  it("handles an array-shaped embedded connection", async () => {
    h.row = githubLink({
      git_connections: [{ provider: "github", installation_id: 4242, source: "relay" }],
    });
    expect(await resolveRepoCloneTarget("project-1")).not.toBeNull();
    expect(h.installationCalls[0]).toMatchObject({ installationId: 4242 });
    expect(h.providerSources).toEqual(["relay"]);
  });

  it.each([
    { provider: "github", installation_id: null, source: "local" },
    { provider: "gitlab", installation_id: 4242, source: "local" },
    { provider: "github", installation_id: 0, source: "local" },
    { provider: "github", installation_id: -1, source: "local" },
    null,
  ])("returns no target when the linked connection has no GitHub installation: %j", async (connection) => {
    h.row = githubLink({ git_connections: connection });
    await expect(resolveRepoCloneTarget("project-1")).resolves.toBeNull();
    expect(h.installationCalls).toEqual([]);
    expect(h.gitlabCalls).toEqual([]);
  });

  it("preserves a complete link's installation rather than replacing it", async () => {
    h.row = githubLink({
      installation_id: 42,
      git_connections: { provider: "github", installation_id: 4242, source: "local" },
    });
    expect(await resolveRepoCloneTarget("project-1")).not.toBeNull();
    expect(h.installationCalls[0]).toMatchObject({ installationId: 42 });
  });

  it("still rejects a malformed repository identity after recovering the installation", async () => {
    h.row = githubLink({
      external_repo_id: "fixture-repo",
      git_connections: { provider: "github", installation_id: 4242, source: "local" },
    });
    await expect(resolveRepoCloneTarget("project-1")).rejects.toThrow(
      "GitHub link is missing a stable repository id",
    );
    expect(h.installationCalls).toEqual([]);
  });

  it("skips an incomplete link and uses another accessible link to the same repository", async () => {
    h.rows = [githubLink(), githubLink({
      id: "link-2", project_id: "project-2", connection_id: "connection-2",
      installation_id: 4343,
    })];
    h.accessibleProjects.add("project-1");
    h.accessibleProjects.add("project-2");
    const target = await resolveRepoCloneTargetForRepo({
      userId: "reader", provider: "github", repoFullName: "acme/private-app",
    });
    expect(target?.linkId).toBe("link-2");
    expect(h.installationCalls).toHaveLength(1);
    expect(h.installationCalls[0]).toMatchObject({ installationId: 4343 });
  });

  it("does not recover an installation through an inaccessible project", async () => {
    h.rows = [githubLink(), githubLink({
      project_id: "private-project",
      git_connections: { provider: "github", installation_id: 4242, source: "relay" },
    })];
    h.accessibleProjects.add("project-1");
    await expect(resolveRepoCloneTargetForRepo({
      userId: "reader", provider: "github", repoFullName: "acme/private-app",
    })).resolves.toBeNull();
    expect(h.installationCalls).toEqual([]);
  });
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

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  rows: [] as Record<string, unknown>[],
  accessibleProjects: new Set<string>(),
  readOnlyProjects: new Set<string>(),
  selectedColumns: [] as string[],
  providerSources: [] as (string | null)[],
  installationCalls: [] as unknown[],
  gitlabCalls: [] as string[],
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
    !h.accessibleProjects.has(projectId) ? null
      : h.readOnlyProjects.has(projectId) ? { role: "reader", canWrite: false, canComment: false }
        : { role: "member", canWrite: true, canComment: true }),
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

import {
  resolveLinkedRepository,
  resolveLinkedRepositoryForRepo,
  resolveLinkedRepositoryWithAccess,
} from "./repo-access";

beforeEach(() => {
  h.installationCalls.length = 0;
  h.row = null;
  h.rows = [];
  h.accessibleProjects.clear();
  h.readOnlyProjects.clear();
  h.selectedColumns.length = 0;
  h.providerSources.length = 0;
  h.gitlabCalls.length = 0;
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
  it.each(["local", "relay"])("recovers the installation from the linked %s connection", async (source) => {
    h.row = githubLink({
      git_connections: { provider: "github", installation_id: 4242, source },
    });
    const target = await resolveLinkedRepository("project-1");
    expect(target?.connectionId).toBe("connection-1");
    expect(h.installationCalls).toEqual([{
      installationId: 4242,
      scope: { repositoryIds: [9001] },
    }]);
    expect(h.providerSources).toEqual([source]);
    expect(h.selectedColumns[0]).toContain("git_connections(source, provider, installation_id)");
  });

  it("handles an array-shaped embedded connection", async () => {
    h.row = githubLink({
      git_connections: [{ provider: "github", installation_id: 4242, source: "relay" }],
    });
    expect(await resolveLinkedRepository("project-1")).not.toBeNull();
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
    await expect(resolveLinkedRepository("project-1")).resolves.toBeNull();
    expect(h.installationCalls).toEqual([]);
    expect(h.gitlabCalls).toEqual([]);
  });

  it("preserves a complete link's installation rather than replacing it", async () => {
    h.row = githubLink({
      installation_id: 42,
      git_connections: { provider: "github", installation_id: 4242, source: "local" },
    });
    expect(await resolveLinkedRepository("project-1")).not.toBeNull();
    expect(h.installationCalls[0]).toMatchObject({ installationId: 42 });
  });

  it("still rejects a malformed repository identity after recovering the installation", async () => {
    h.row = githubLink({
      external_repo_id: "fixture-repo",
      git_connections: { provider: "github", installation_id: 4242, source: "local" },
    });
    await expect(resolveLinkedRepository("project-1")).rejects.toThrow(
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
    const target = await resolveLinkedRepositoryForRepo({
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
    await expect(resolveLinkedRepositoryForRepo({
      userId: "reader", provider: "github", repoFullName: "acme/private-app",
    })).resolves.toBeNull();
    expect(h.installationCalls).toEqual([]);
  });
});

describe("forge credentials", () => {
  it("scopes the GitHub token to the linked repository and returns no credential URL", async () => {
    h.row = githubLink({ installation_id: 42 });
    const target = await resolveLinkedRepository("project-1");
    expect(h.installationCalls).toEqual([
      { installationId: 42, scope: { repositoryIds: [9001] } },
    ]);
    expect(target).toMatchObject({ provider: "github", token: "github-short-lived-token" });
    expect(JSON.stringify(target)).not.toContain("@github.com");
  });

  it("uses the linking connection's GitLab token", async () => {
    h.row = githubLink({
      id: "link-2",
      provider: "gitlab",
      connection_id: "connection-2",
      external_repo_id: "12345",
      repo_full_name: "group/private-app",
      git_connections: { source: "local" },
    });
    const target = await resolveLinkedRepository("project-1");
    expect(h.gitlabCalls).toEqual(["connection-2"]);
    expect(target).toMatchObject({ provider: "gitlab", token: "gitlab-account-wide-token" });
  });

  it("refuses an unknown provider", async () => {
    h.row = githubLink({ provider: "bitbucket", installation_id: 42 });
    await expect(resolveLinkedRepository("project-1")).rejects.toThrow("Unknown repo provider");
  });
});

describe("project roles (MIN-693)", () => {
  const twoLinks = () => [
    githubLink({ installation_id: 4141 }),
    githubLink({ id: "link-2", project_id: "project-2", connection_id: "connection-2", installation_id: 4343 }),
  ];

  it("acts through a project where the user can write before a read-only one", async () => {
    h.rows = twoLinks();
    h.accessibleProjects.add("project-1");
    h.accessibleProjects.add("project-2");
    h.readOnlyProjects.add("project-1");
    const resolved = await resolveLinkedRepositoryWithAccess({
      userId: "user", provider: "github", repoFullName: "acme/private-app",
    });
    expect(resolved).toMatchObject({ canWrite: true, target: { linkId: "link-2" } });
  });

  it("still resolves reads for a reader, flagged as read-only", async () => {
    h.rows = twoLinks();
    h.accessibleProjects.add("project-1");
    h.readOnlyProjects.add("project-1");
    const resolved = await resolveLinkedRepositoryWithAccess({
      userId: "user", provider: "github", repoFullName: "acme/private-app",
    });
    expect(resolved).toMatchObject({ canWrite: false, target: { linkId: "link-1" } });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  installationCalls: [] as unknown[],
  gitlabCalls: [] as string[],
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
vi.mock("@/lib/server/git/gitlab-rest", () => ({ GITLAB_HOST: "https://gitlab.com" }));

import { resolveRepoCloneTarget } from "./repo-access";

beforeEach(() => {
  h.installationCalls.length = 0;
  h.gitlabCalls.length = 0;
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
      repo_full_name: "acme/private-app",
      default_branch: "main",
      git_connections: { source: "local" },
    };

    const target = await resolveRepoCloneTarget("project-1", access);
    expect(h.installationCalls).toEqual([
      {
        installationId: 42,
        scope: { repositories: ["private-app"], permissions },
      },
    ]);
    expect(target?.remoteUrl).toBe("https://github.com/acme/private-app.git");
    expect(target?.remoteUrl).not.toContain("github-short-lived-token");
  });

  it("keeps the GitLab account-wide OAuth token out of the persistent remote", async () => {
    h.row = {
      id: "link-2",
      provider: "gitlab",
      connection_id: "connection-2",
      installation_id: null,
      repo_full_name: "group/private-app",
      default_branch: "main",
      git_connections: { source: "local" },
    };

    const target = await resolveRepoCloneTarget("project-1", "repo-read");
    expect(h.gitlabCalls).toEqual(["connection-2"]);
    expect(target?.remoteUrl).toBe("https://gitlab.com/group/private-app.git");
    expect(target?.remoteUrl).not.toContain("gitlab-account-wide-token");
    expect(target?.authUrl).toContain("gitlab-account-wide-token");
  });
});

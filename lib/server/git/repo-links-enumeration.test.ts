import { beforeEach, describe, expect, it, vi } from "vitest";

let listingCalls = 0;
let mintInputs: unknown[] = [];
let listingGate: Promise<void> | null = null;

vi.mock("./github-app", () => ({
  listInstallationRepositories: async (
    installationId: number,
    mint: (input: unknown) => Promise<{ token: string; expiresAt: string }>,
  ) => {
    listingCalls += 1;
    await mint({ installationId });
    if (listingGate) await listingGate;
    return [{
      id: 9001,
      owner: "acme",
      name: "app",
      fullName: "acme/app",
      defaultBranch: "main",
    }];
  },
}));

vi.mock("./forge-provider", () => ({
  forgeProviderForConnection: () => ({
    getInstallationToken: async (input: unknown) => {
      mintInputs.push(input);
      return { token: "relay-token", expiresAt: "2099-01-01T00:00:00Z" };
    },
  }),
}));

vi.mock("./gitlab-app", () => ({
  getGitlabAccessToken: vi.fn(),
  listGitlabProjects: vi.fn(),
}));
vi.mock("./connections", () => ({ getUserConnection: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: vi.fn() }));
vi.mock("@/lib/server/forge-relay/client", () => ({
  isForgeRelayClientConfigured: () => false,
}));
vi.mock("@/lib/server/forge-relay/link-push", () => ({ pushRelayLinkEvent: vi.fn() }));

const { listCandidateRepos } = await import("./repo-links");

beforeEach(() => {
  listingCalls = 0;
  mintInputs = [];
  listingGate = null;
});

describe("candidate repository enumeration", () => {
  it("uses the relay provider's object-shaped token minter", async () => {
    await expect(
      listCandidateRepos({
        id: "relay-connection-1",
        provider: "github",
        installation_id: 4242,
        source: "relay",
      }),
    ).resolves.toEqual([
      expect.objectContaining({ external_repo_id: "9001", full_name: "acme/app" }),
    ]);
    expect(mintInputs).toEqual([{ installationId: 4242 }]);
  });

  it("shares one in-flight listing for concurrent callers", async () => {
    let release!: () => void;
    listingGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const connection = {
      id: "relay-connection-2",
      provider: "github" as const,
      installation_id: 4343,
      source: "relay",
    };
    const first = listCandidateRepos(connection);
    const second = listCandidateRepos(connection);
    await vi.waitFor(() => expect(listingCalls).toBe(1));
    release();
    await Promise.all([first, second]);
    expect(listingCalls).toBe(1);
    expect(mintInputs).toHaveLength(1);
  });
});

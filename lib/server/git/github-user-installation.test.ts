import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/capabilities", () => ({
  requireCapability: () => undefined,
}));
vi.mock("@/lib/server/forge-relay/client", () => ({
  isForgeRelayClientConfigured: () => false,
}));

const { getGithubUserInstallationRepository } = await import(
  "./github-user-auth"
);

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("getGithubUserInstallationRepository", () => {
  it("uses the user-scoped installation endpoint and returns a stable repository identity", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          repositories: [{ id: 991, full_name: "acme/app" }],
        }),
        { status: 200 },
      ),
    );

    await expect(
      getGithubUserInstallationRepository("user-token", 4242),
    ).resolves.toEqual({ id: 991, fullName: "acme/app" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/user/installations/4242/repositories?per_page=1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer user-token" }),
      }),
    );
  });

  it("refuses an inaccessible installation and an installation without repositories", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    );
    await expect(
      getGithubUserInstallationRepository("user-token", 9999),
    ).rejects.toThrow("Not Found");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ repositories: [] }), { status: 200 }),
    );
    await expect(
      getGithubUserInstallationRepository("user-token", 4242),
    ).resolves.toBeNull();
  });
});


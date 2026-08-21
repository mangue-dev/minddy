import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/git/gitlab/relay-callback — the instance browser hop of the
 * brokered GitLab connection. Pinned: the redirect leads back where the
 * connect was started from (`return`, mirrored from the instance-signed
 * authorize state), an exotic `return` value falls back to the account git
 * settings instead of leaving the instance, and the connection id rides
 * along exactly like the local callback's suffix.
 */

let deliveryResult: {
  ok: boolean;
  status: number;
  data: unknown;
  error: string | null;
} = { ok: false, status: 404, data: null, error: "pending" };

vi.mock("@/lib/server/forge-relay/client", () => ({
  isForgeRelayClientConfigured: () => true,
  relayRequest: async () => deliveryResult,
}));

vi.mock("@/lib/server/app-origin", () => ({
  canonicalAppOrigin: () => "https://on-prem.example.com",
}));

const { upsertGitlabConnection } = vi.hoisted(() => ({
  upsertGitlabConnection: vi.fn(),
}));
vi.mock("@/lib/server/git/connections", () => ({
  upsertGitlabConnection: (...args: unknown[]) => upsertGitlabConnection(...args),
}));

const { GET: relayCallback } = await import("@/app/api/git/gitlab/relay-callback/route");

function request(url: string): never {
  return { nextUrl: new URL(url) } as never;
}

function delivered(): void {
  deliveryResult = {
    ok: true,
    status: 200,
    data: {
      status: "delivered",
      userId: "user-on-instance",
      account: { id: 42, login: "octo", avatarUrl: null },
      tokens: {
        accessToken: "gitlab-access-token",
        expiresAt: "2026-08-21T20:00:00Z",
        refreshToken: "gitlab-refresh-token",
        scope: "api",
      },
    },
    error: null,
  };
}

beforeEach(() => {
  delivered();
  upsertGitlabConnection.mockReset().mockResolvedValue("conn-gitlab-1");
});

describe("GET /api/git/gitlab/relay-callback", () => {
  it("returns to the project settings when the state carried a project return path", async () => {
    const response = await relayCallback(
      request(
        "https://on-prem.example.com/api/git/gitlab/relay-callback?delivery=0f0e0d0c-0b0a-4948-8272-6d6f64656c79&return=%2Fprojects%2Fp-1%2Fsettings%3Ftab%3Dgit",
      ),
    );
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") as string);
    expect(location.origin + location.pathname).toBe(
      "https://on-prem.example.com/projects/p-1/settings",
    );
    expect(location.searchParams.get("tab")).toBe("git");
    expect(location.searchParams.get("git")).toBe("connected");
    // Same suffix contract as the local callback: the panel reopens the
    // repository selector on the connection just created.
    expect(location.searchParams.get("connection")).toBe("conn-gitlab-1");
    expect(upsertGitlabConnection).toHaveBeenCalledWith(
      expect.objectContaining({ source: "relay" }),
    );
  });

  it("falls back to the account git settings without a return context", async () => {
    const response = await relayCallback(
      request(
        "https://on-prem.example.com/api/git/gitlab/relay-callback?delivery=0f0e0d0c-0b0a-4948-8272-6d6f64656c79",
      ),
    );
    const location = new URL(response.headers.get("location") as string);
    expect(location.pathname).toBe("/settings");
    expect(location.searchParams.get("tab")).toBe("git");
    expect(location.searchParams.get("git")).toBe("connected");
    // The plain account-settings page ignores the connection id.
    expect(location.searchParams.get("connection")).toBeNull();
  });

  it("refuses to leave the instance on an exotic return value", async () => {
    const response = await relayCallback(
      request(
        "https://on-prem.example.com/api/git/gitlab/relay-callback?delivery=0f0e0d0c-0b0a-4948-8272-6d6f64656c79&return=https%3A%2F%2Fevil.example%2Fphishing",
      ),
    );
    const location = new URL(response.headers.get("location") as string);
    expect(location.origin).toBe("https://on-prem.example.com");
    expect(location.pathname).toBe("/settings");
  });

  it("reports the failure on the return page without storing anything", async () => {
    deliveryResult = { ok: false, status: 404, data: null, error: "unavailable" };
    const response = await relayCallback(
      request(
        "https://on-prem.example.com/api/git/gitlab/relay-callback?delivery=0f0e0d0c-0b0a-4948-8272-6d6f64656c79&return=%2Fhome%3Fsetup%3Dgit",
      ),
    );
    const location = new URL(response.headers.get("location") as string);
    expect(location.pathname).toBe("/home");
    expect(location.searchParams.get("setup")).toBe("git");
    expect(location.searchParams.get("git")).toBe("error");
    expect(upsertGitlabConnection).not.toHaveBeenCalled();
  });
});

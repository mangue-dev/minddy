import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

/**
 * Instance side of the installation claim
 * (docs/managed-forge-relay-plan.md, "Installation claim"): `POST` hands the
 * operator's browser a Cloud claim URL, `GET` polls the outcome and stores the
 * local connection flagged `source: "relay"` — the marker that routes this
 * connection's token mints to the relay provider.
 */

let relayConfigured = true;
let authUserId = "operator-user-id";
const relayCalls: { path: string; body: Record<string, unknown> }[] = [];
let claimResult: { ok: boolean; error: string | null; data: unknown } = {
  ok: true,
  error: null,
  data: { status: "pending" },
};

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({
    ok: true as const,
    user: { id: authUserId },
    supabase: {},
    response: null,
  }),
}));
vi.mock("@/lib/server/forge-relay/client", () => ({
  isForgeRelayClientConfigured: () => relayConfigured,
  forgeRelaySigningKey: () => "relay-claim-secret",
  forgeRelayConfig: () =>
    relayConfigured
      ? {
          url: "https://relay.example.com",
          instanceId: "0f0e0d0c-0b0a-4948-8272-6d6f64656c79",
          secret: "secret",
        }
      : null,
  relayRequest: async (path: string, body: Record<string, unknown>) => {
    relayCalls.push({ path, body });
    return claimResult;
  },
  startGithubRelayClaim: async (code: string) => {
    relayCalls.push({ path: "/api/relay/github/claim-start", body: { code } });
    return `https://relay.example.com/api/relay/github/claim?instance=0f0e0d0c-0b0a-4948-8272-6d6f64656c79&code=${code}`;
  },
}));

const upsertGithubConnection = vi.fn();
vi.mock("@/lib/server/git/connections", () => ({
  upsertGithubConnection: (...args: unknown[]) => upsertGithubConnection(...args),
}));

const { POST: startClaim, GET: pollClaim } = await import(
  "@/app/api/git/github/relay-claim/route"
);

const NONCE = "c".repeat(64);
const codeFor = (userId: string) =>
  `${NONCE}.${crypto
    .createHmac("sha256", "relay-claim-secret")
    .update(`${userId}\0${NONCE}`, "utf8")
    .digest("hex")}`;
const CODE = codeFor("operator-user-id");

beforeEach(() => {
  relayConfigured = true;
  authUserId = "operator-user-id";
  relayCalls.length = 0;
  claimResult = { ok: true, error: null, data: { status: "pending" } };
  upsertGithubConnection.mockReset();
});

function getRequest(url: string): never {
  // The route only reads `nextUrl`; a plain Request has none.
  return { nextUrl: new URL(url) } as never;
}

describe("POST /api/git/github/relay-claim", () => {
  it("hands back the Cloud claim URL and a single-use code", async () => {
    const response = await startClaim(
      new Request("http://localhost/api/git/github/relay-claim", { method: "POST" }) as never,
    );
    expect(response.status).toBe(200);
    const { claimUrl, code } = (await response.json()) as { claimUrl: string; code: string };
    expect(code).toMatch(/^[0-9a-f]{64}\.[0-9a-f]{64}$/);
    expect(claimUrl).toContain("https://relay.example.com/api/relay/github/claim?instance=");
    expect(claimUrl).toContain(`code=${code}`);
    expect(relayCalls).toEqual([
      { path: "/api/relay/github/claim-start", body: { code } },
    ]);
  });

  it("refuses to start when the relay is not configured", async () => {
    relayConfigured = false;
    const response = await startClaim(
      new Request("http://localhost/api/git/github/relay-claim", { method: "POST" }) as never,
    );
    expect(response.status).toBe(400);
  });
});

describe("GET /api/git/github/relay-claim", () => {
  it("reports pending with the server-derived claim URL", async () => {
    const response = await pollClaim(getRequest(`http://localhost/api/git/github/relay-claim?code=${CODE}`));
    expect(response.status).toBe(200);
    // The claim URL comes from the pinned relay configuration, never from
    // the client: the interstitial can only open this instance's own claim
    // page.
    await expect(response.json()).resolves.toEqual({
      status: "pending",
      claimUrl: `https://relay.example.com/api/relay/github/claim?instance=0f0e0d0c-0b0a-4948-8272-6d6f64656c79&code=${CODE}`,
    });
    expect(relayCalls).toEqual([
      { path: "/api/relay/github/claim-result", body: { code: CODE } },
    ]);
    expect(upsertGithubConnection).not.toHaveBeenCalled();
  });

  it("stores the relayed connection on success", async () => {
    upsertGithubConnection.mockResolvedValue("conn-relay-1");
    claimResult = {
      ok: true,
      error: null,
      data: { status: "claimed", installationId: 4242, accountLogin: "acme" },
    };

    const response = await pollClaim(getRequest(`http://localhost/api/git/github/relay-claim?code=${CODE}`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "connected", connectionId: "conn-relay-1" });
    expect(upsertGithubConnection).toHaveBeenCalledWith({
      userId: "operator-user-id",
      installationId: 4242,
      accountLogin: "acme",
      accountType: null,
      repositorySelection: null,
      source: "relay",
    });
  });

  it("surfaces a relay refusal instead of storing a half connection", async () => {
    claimResult = { ok: false, error: "Relay instance is revoked", data: null };
    const response = await pollClaim(getRequest(`http://localhost/api/git/github/relay-claim?code=${CODE}`));
    expect(response.status).toBe(502);
    expect(upsertGithubConnection).not.toHaveBeenCalled();
  });

  it("refuses a claim code started by another local account", async () => {
    authUserId = "other-user-id";
    const response = await pollClaim(
      getRequest(`http://localhost/api/git/github/relay-claim?code=${CODE}`),
    );
    expect(response.status).toBe(400);
    expect(relayCalls).toHaveLength(0);
    expect(upsertGithubConnection).not.toHaveBeenCalled();
  });

  it("refuses a malformed claim code", async () => {
    const response = await pollClaim(getRequest("http://localhost/api/git/github/relay-claim?code=short"));
    expect(response.status).toBe(400);
    expect(relayCalls).toHaveLength(0);
  });
});

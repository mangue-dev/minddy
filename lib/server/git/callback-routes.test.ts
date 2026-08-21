import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-324 — the three forge callbacks, exercised branch by branch.
 *
 * Two things to hold, and they are independent:
 *
 * 1. **The confrontation `state` ↔ session.** One `state` signed proves that it was
 * minted; it does not prove who presents it. Without a corresponding session,
 * no writing — neither installation upsert, nor exchange of the `code` (burning the
 * would only serve to deprive the victim of his).
 * 2. **Cookies returned (MIN-293).** These routes are the first to open
 * cookies session, with a token that may be expired: each
 * output, including error redirects, must pass back through
 * `applyCookies`. We check it on EACH branch rather than counting the
 * `return` of the file.
 */

process.env.GIT_STATE_SECRET = "test-git-state-secret-long-enough-32";

const getClaims = vi.fn();

/** The refreshed cookie that the sink collected: its presence proves applyCookies. */
const REFRESHED = { name: "sb-access-token", value: "fresh", options: {} };

vi.mock("@/lib/server/api-auth", () => ({
  createSupabaseWithCookieSink: () => ({
    supabase: { auth: { getClaims } },
    collect: () => {},
    applyCookies: (response: { cookies: { set: (n: string, v: string) => void } }) => {
      response.cookies.set(REFRESHED.name, REFRESHED.value);
      return response;
    },
  }),
}));

// The setup route checks `forge_relay_installations` before storing a Cloud
// connection (an installation claimed by an instance must not become a Cloud
// connection). These tests exercise the LOCAL branch: no relay claims exist.
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: null }),
      };
      return chain;
    },
  }),
}));

const getInstallationAccount = vi.fn();
const upsertGithubConnection = vi.fn();
vi.mock("@/lib/server/git/github-app", () => ({
  getInstallationAccount: (...a: unknown[]) => getInstallationAccount(...a),
}));

const upsertGitlabConnection = vi.fn();
vi.mock("@/lib/server/git/connections", () => ({
  upsertGithubConnection: (...a: unknown[]) => upsertGithubConnection(...a),
  upsertGitlabConnection: (...a: unknown[]) => upsertGitlabConnection(...a),
}));

const exchangeGithubUserCode = vi.fn();
const getGithubUserAccount = vi.fn();
vi.mock("@/lib/server/git/github-user-auth", () => ({
  exchangeGithubUserCode: (...a: unknown[]) => exchangeGithubUserCode(...a),
  getGithubUserAccount: (...a: unknown[]) => getGithubUserAccount(...a),
}));

const upsertUserIdentity = vi.fn();
vi.mock("@/lib/server/git/user-identities", () => ({
  upsertUserIdentity: (...a: unknown[]) => upsertUserIdentity(...a),
}));

const exchangeGitlabCode = vi.fn();
const getGitlabUser = vi.fn();
vi.mock("@/lib/server/git/gitlab-app", () => ({
  exchangeGitlabCode: (...a: unknown[]) => exchangeGitlabCode(...a),
  getGitlabUser: (...a: unknown[]) => getGitlabUser(...a),
}));

const { signGitLinkState, ACCOUNT_CONNECT_PROJECT } = await import("./link-state");
const { GET: setupGET } = await import("@/app/api/git/github/setup/route");
const { GET: userCallbackGET } = await import(
  "@/app/api/git/github/user-callback/route"
);
const { GET: gitlabGET } = await import("@/app/api/git/gitlab/callback/route");

const { NextRequest } = await import("next/server");

const OWNER = "11111111-1111-4111-8111-111111111111";
const ATTACKER = "22222222-2222-4222-8222-222222222222";

function request(path: string, query: Record<string, string>) {
  const url = new URL(`https://minddy.app${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function signedIn(userId: string | null) {
  getClaims.mockResolvedValue(
    userId ? { data: { claims: { sub: userId } } } : { data: null },
  );
}

/** The cookies invariant: true for all output, whatever the branch. */
function expectCookiesApplied(response: { cookies: { get: (n: string) => unknown } }) {
  expect(response.cookies.get(REFRESHED.name)).toBeTruthy();
}

function location(response: Response) {
  return response.headers.get("location") ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  getInstallationAccount.mockResolvedValue({
    login: "acme",
    type: "Organization",
    repositorySelection: "selected",
  });
  upsertGithubConnection.mockResolvedValue("conn-1");
  upsertGitlabConnection.mockResolvedValue("conn-gl");
  exchangeGithubUserCode.mockResolvedValue({ accessToken: "gho_x" });
  getGithubUserAccount.mockResolvedValue({ id: 7, login: "octo", avatarUrl: null });
  exchangeGitlabCode.mockResolvedValue({ accessToken: "gl_x" });
  getGitlabUser.mockResolvedValue({ id: 9, username: "octo" });
});

describe("GET /api/git/github/setup", () => {
  const state = () =>
    signGitLinkState({
      projectId: ACCOUNT_CONNECT_PROJECT,
      userId: OWNER,
      provider: "github",
      origin: "account",
    });

  it("session absente → git=error, et aucune installation enregistrée", async () => {
    signedIn(null);
    const response = await setupGET(
      request("/api/git/github/setup", {
        state: state(),
        installation_id: "4242",
      }),
    );
    expect(location(response)).toContain("git=error");
    expect(upsertGithubConnection).not.toHaveBeenCalled();
    expectCookiesApplied(response);
  });

  it("session ≠ state.userId → git=error : c'est le vol d'installation", async () => {
    signedIn(ATTACKER);
    const response = await setupGET(
      request("/api/git/github/setup", {
        state: state(),
        installation_id: "4242",
      }),
    );
    expect(location(response)).toContain("git=error");
    expect(upsertGithubConnection).not.toHaveBeenCalled();
    expectCookiesApplied(response);
  });

  it("session = state.userId → chemin nominal", async () => {
    signedIn(OWNER);
    const response = await setupGET(
      request("/api/git/github/setup", {
        state: state(),
        installation_id: "4242",
      }),
    );
    expect(location(response)).toContain("git=connected");
    expect(upsertGithubConnection).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OWNER, installationId: 4242 }),
    );
    expectCookiesApplied(response);
  });

  it("state absent → git=error, cookies rendus quand même", async () => {
    signedIn(OWNER);
    const response = await setupGET(request("/api/git/github/setup", {}));
    expect(location(response)).toContain("git=error");
    expectCookiesApplied(response);
  });

  it("installation_id absent → git=error, cookies rendus quand même", async () => {
    signedIn(OWNER);
    const response = await setupGET(
      request("/api/git/github/setup", { state: state() }),
    );
    expect(location(response)).toContain("git=error");
    expectCookiesApplied(response);
  });

  it("erreur en aval → git=error sans détail, cookies rendus", async () => {
    signedIn(OWNER);
    upsertGithubConnection.mockRejectedValue(
      new Error("GitHub installation is already linked to another account"),
    );
    const response = await setupGET(
      request("/api/git/github/setup", {
        state: state(),
        installation_id: "4242",
      }),
    );
    expect(location(response)).toContain("git=error");
    expect(location(response)).not.toContain("already linked");
    expectCookiesApplied(response);
  });
});

describe("GET /api/git/github/user-callback", () => {
  const state = () =>
    signGitLinkState({
      projectId: ACCOUNT_CONNECT_PROJECT,
      userId: OWNER,
      provider: "github",
      origin: "settings",
    });

  it("session absente → git=error, et le code n'est pas échangé", async () => {
    signedIn(null);
    const response = await userCallbackGET(
      request("/api/git/github/user-callback", { state: state(), code: "c" }),
    );
    expect(location(response)).toContain("git=error");
    expect(exchangeGithubUserCode).not.toHaveBeenCalled();
    expect(upsertUserIdentity).not.toHaveBeenCalled();
    expectCookiesApplied(response);
  });

  it("session ≠ state.userId → le jeton de la victime n'est jamais demandé", async () => {
    signedIn(ATTACKER);
    const response = await userCallbackGET(
      request("/api/git/github/user-callback", { state: state(), code: "c" }),
    );
    expect(location(response)).toContain("git=error");
    expect(exchangeGithubUserCode).not.toHaveBeenCalled();
    expectCookiesApplied(response);
  });

  it("session = state.userId → chemin nominal", async () => {
    signedIn(OWNER);
    const response = await userCallbackGET(
      request("/api/git/github/user-callback", { state: state(), code: "c" }),
    );
    expect(location(response)).toContain("git=connected");
    expect(upsertUserIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OWNER }),
    );
    expectCookiesApplied(response);
  });

  it("state absent → git=error, cookies rendus", async () => {
    signedIn(OWNER);
    const response = await userCallbackGET(
      request("/api/git/github/user-callback", { code: "c" }),
    );
    expect(location(response)).toContain("git=error");
    expectCookiesApplied(response);
  });

  it("code absent → git=error, cookies rendus", async () => {
    signedIn(OWNER);
    const response = await userCallbackGET(
      request("/api/git/github/user-callback", { state: state() }),
    );
    expect(location(response)).toContain("git=error");
    expectCookiesApplied(response);
  });

  it("échec de l'échange → git=error, cookies rendus", async () => {
    signedIn(OWNER);
    exchangeGithubUserCode.mockRejectedValue(new Error("bad code"));
    const response = await userCallbackGET(
      request("/api/git/github/user-callback", { state: state(), code: "c" }),
    );
    expect(location(response)).toContain("git=error");
    expectCookiesApplied(response);
  });
});

describe("GET /api/git/gitlab/callback", () => {
  const state = () =>
    signGitLinkState({
      projectId: ACCOUNT_CONNECT_PROJECT,
      userId: OWNER,
      provider: "gitlab",
      origin: "account",
    });

  it("session absente → git=error, et le code n'est pas échangé", async () => {
    signedIn(null);
    const response = await gitlabGET(
      request("/api/git/gitlab/callback", { state: state(), code: "c" }),
    );
    expect(location(response)).toContain("git=error");
    expect(exchangeGitlabCode).not.toHaveBeenCalled();
    expect(upsertGitlabConnection).not.toHaveBeenCalled();
    expectCookiesApplied(response);
  });

  it("session ≠ state.userId → git=error", async () => {
    signedIn(ATTACKER);
    const response = await gitlabGET(
      request("/api/git/gitlab/callback", { state: state(), code: "c" }),
    );
    expect(location(response)).toContain("git=error");
    expect(exchangeGitlabCode).not.toHaveBeenCalled();
    expectCookiesApplied(response);
  });

  it("session = state.userId → chemin nominal", async () => {
    signedIn(OWNER);
    const response = await gitlabGET(
      request("/api/git/gitlab/callback", { state: state(), code: "c" }),
    );
    expect(location(response)).toContain("git=connected");
    expect(upsertGitlabConnection).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OWNER }),
    );
    expectCookiesApplied(response);
  });

  it("state absent → git=error, cookies rendus", async () => {
    signedIn(OWNER);
    const response = await gitlabGET(
      request("/api/git/gitlab/callback", { code: "c" }),
    );
    expect(location(response)).toContain("git=error");
    expectCookiesApplied(response);
  });

  it("code absent → git=error, cookies rendus", async () => {
    signedIn(OWNER);
    const response = await gitlabGET(
      request("/api/git/gitlab/callback", { state: state() }),
    );
    expect(location(response)).toContain("git=error");
    expectCookiesApplied(response);
  });

  it("échec de l'échange → git=error, cookies rendus", async () => {
    signedIn(OWNER);
    exchangeGitlabCode.mockRejectedValue(new Error("bad code"));
    const response = await gitlabGET(
      request("/api/git/gitlab/callback", { state: state(), code: "c" }),
    );
    expect(location(response)).toContain("git=error");
    expectCookiesApplied(response);
  });
});

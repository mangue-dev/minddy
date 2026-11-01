import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * `getAuthedAdmin` authenticates and authorizes an admin API request with one
 * `auth_authorization_state` lookup, and fails closed exactly where
 * `getAuthedUser` followed by `isAdminUser` would.
 */

const ADMIN = "11111111-1111-4111-8111-111111111111";
const SESSION = "33333333-3333-4333-8333-333333333333";
const getClaims = vi.fn();
const getUserById = vi.fn();
const rpc = vi.fn();
const abortSignal = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims } }) }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ auth: { admin: { getUserById } }, rpc }),
}));

const { getAuthedAdmin } = await import("./admin");

const request = () => new NextRequest("https://www.minddy.app/api/admin/overview");

function account(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      user: {
        id: ADMIN,
        email: "boss@minddy.app",
        email_confirmed_at: "2026-08-01T00:00:00.000Z",
        app_metadata: { mfa_enabled: true },
        factors: [{ id: "factor-1", status: "verified" }],
        ...overrides,
      },
    },
    error: null,
  };
}

function signedClaims(overrides: Record<string, unknown> = {}) {
  getClaims.mockResolvedValue({
    data: { claims: { sub: ADMIN, session_id: SESSION, aal: "aal2", amr: [], app_metadata: {}, ...overrides } },
    error: null,
  });
}

beforeEach(() => {
  process.env.ADMIN_EMAILS = "boss@minddy.app";
  getClaims.mockReset();
  getUserById.mockReset().mockResolvedValue(account());
  rpc.mockReset().mockReturnValue({ abortSignal });
  abortSignal.mockReset().mockResolvedValue({ data: { sessionActive: true, mfaAllowed: true }, error: null });
  signedClaims();
});

describe("getAuthedAdmin", () => {
  it("admits a live allowlisted AAL2 admin with exactly one authorization lookup", async () => {
    const result = await getAuthedAdmin(request());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.id).toBe(ADMIN);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("auth_authorization_state", {
      p_user: ADMIN, p_session: SESSION, p_aal: "aal2", p_amr: [],
    });
    expect(getUserById).toHaveBeenCalledWith(ADMIN);
  });

  it("reads the account while the authorization lookup is still in flight", async () => {
    let answer: (value: unknown) => void = () => {};
    abortSignal.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const pending = getAuthedAdmin(request());
    await new Promise((done) => setImmediate(done));
    expect(getUserById).toHaveBeenCalledOnce();
    answer({ data: { sessionActive: true, mfaAllowed: true }, error: null });
    expect((await pending).ok).toBe(true);
  });

  it.each([
    { name: "a revoked session", live: { data: { sessionActive: false, mfaAllowed: true }, error: null }, status: 401 },
    { name: "a missing second factor", live: { data: { sessionActive: true, mfaAllowed: false }, error: null }, status: 403 },
    { name: "an unavailable lookup", live: { data: null, error: { message: "unavailable" } }, status: 503 },
  ])("answers $name before any admin decision", async ({ live, status }) => {
    abortSignal.mockResolvedValue(live);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await getAuthedAdmin(request());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(status);
    } finally { log.mockRestore(); }
  });

  it("answers an unauthenticated caller with 401", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    const result = await getAuthedAdmin(request());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("refuses an AAL1 session without looking the account up", async () => {
    signedClaims({ aal: "aal1" });
    const result = await getAuthedAdmin(request());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(getUserById).not.toHaveBeenCalled();
  });

  it.each([
    { name: "an account outside the allowlist", user: { email: "intruder@example.test" } },
    { name: "an unconfirmed address", user: { email_confirmed_at: null } },
    { name: "an account without MFA", user: { app_metadata: {} } },
    { name: "an account without a verified factor", user: { factors: [{ id: "f", status: "unverified" }] } },
    { name: "a banned account", user: { banned_until: new Date(Date.now() + 3_600_000).toISOString() } },
    { name: "another account", user: { id: "99999999-9999-4999-8999-999999999999" } },
  ])("answers 403 for $name", async ({ user }) => {
    getUserById.mockResolvedValue(account(user));
    const result = await getAuthedAdmin(request());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("fails closed when the account read errors or throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      getUserById.mockResolvedValue({ data: { user: null }, error: { message: "down" } });
      const errored = await getAuthedAdmin(request());
      getUserById.mockRejectedValue(new Error("network"));
      const thrown = await getAuthedAdmin(request());
      for (const result of [errored, thrown]) {
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.response.status).toBe(403);
      }
    } finally { log.mockRestore(); }
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const getClaims = vi.fn();
const rpc = vi.fn();
const authorizationAbortSignal = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims } }),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ rpc }),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

const { getAuthedUser } = await import("./api-auth");

function request(): NextRequest {
  return new NextRequest("https://www.minddy.app/api/projects");
}

function signedClaims(overrides: Record<string, unknown> = {}) {
  getClaims.mockResolvedValue({
    data: {
      claims: {
        sub: USER_ID,
        session_id: SESSION_ID,
        aal: "aal1",
        amr: [],
        app_metadata: {},
        ...overrides,
      },
    },
    error: null,
  });
}

beforeEach(() => {
  getClaims.mockReset();
  rpc.mockReset();
  authorizationAbortSignal.mockReset();
  signedClaims();
  authorizationAbortSignal.mockResolvedValue({
    data: { sessionActive: true, mfaAllowed: true },
    error: null,
  });
  rpc.mockReturnValue({ abortSignal: authorizationAbortSignal });
});

describe("getAuthedUser live authorization enforcement", () => {
  it.each(["origin", "referer"])("does not log private %s headers for rejected writes in production", async (header) => {
    const sentinel = "MIN591_PRIVATE_ORIGIN_SENTINEL";
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await getAuthedUser(new NextRequest("https://www.minddy.app/api/projects", {
        method: "POST", headers: { [header]: `https://synthetic.invalid/${sentinel}` },
      }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(403);
      expect(log).toHaveBeenCalled();
      expect(log.mock.calls.flat().map(String).join("\n")).not.toContain(sentinel);
    } finally { log.mockRestore(); vi.unstubAllEnvs(); }
  });

  it.each(["response", "exception"])("does not log private live authorization %s failures in production", async (failure) => {
    const sentinel = "MIN591_PRIVATE_AUTHORIZATION_SENTINEL";
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    if (failure === "response") authorizationAbortSignal.mockResolvedValue({ data: null, error: { message: sentinel } });
    else authorizationAbortSignal.mockRejectedValue(new Error(sentinel));
    try {
      const result = await getAuthedUser(request());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(503);
      expect(log).toHaveBeenCalled();
      expect(log.mock.calls.flat().map(String).join("\n")).not.toContain(sentinel);
    } finally { log.mockRestore(); vi.unstubAllEnvs(); }
  });

  it("returns a controlled failure instead of propagating private authentication exceptions in production", async () => {
    const sentinel = "MIN591_PRIVATE_CLAIMS_SENTINEL";
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    getClaims.mockRejectedValue(new Error(sentinel));
    try {
      const result = await getAuthedUser(request());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(503);
        expect(JSON.stringify(await result.response.json())).not.toContain(sentinel);
      }
      expect(log.mock.calls.flat().map(String).join("\n")).not.toContain(sentinel);
    } finally { log.mockRestore(); vi.unstubAllEnvs(); }
  });
  it("rejects an AAL1 token minted before the account enrolled MFA", async () => {
    authorizationAbortSignal.mockResolvedValue({
      data: { sessionActive: true, mfaAllowed: false },
      error: null,
    });

    const result = await getAuthedUser(request());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toMatchObject({ code: "mfa_required" });
    expect(rpc).toHaveBeenCalledWith("auth_authorization_state", {
      p_user: USER_ID,
      p_session: SESSION_ID,
      p_aal: "aal1",
      p_amr: [],
    });
    expect(authorizationAbortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("allows AAL1 only while the live session and MFA state permit it", async () => {
    const result = await getAuthedUser(request());

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("rejects a protected AAL1 claim from live state", async () => {
    signedClaims({ app_metadata: { mfa_enabled: true } });
    authorizationAbortSignal.mockResolvedValue({
      data: { sessionActive: true, mfaAllowed: false },
      error: null,
    });

    const result = await getAuthedUser(request());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("accepts AAL2 only after checking live session and factor state", async () => {
    signedClaims({
      aal: "aal2",
      amr: [{ method: "totp", timestamp: 1_788_739_200 }],
      app_metadata: { mfa_enabled: true },
    });

    const result = await getAuthedUser(request());

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("auth_authorization_state", {
      p_user: USER_ID,
      p_session: SESSION_ID,
      p_aal: "aal2",
      p_amr: [{ method: "totp", timestamp: 1_788_739_200 }],
    });
  });

  it("rejects a stale AAL2 token after the last factor is removed", async () => {
    signedClaims({
      aal: "aal2",
      amr: [{ method: "totp", timestamp: 1_788_739_200 }],
      app_metadata: { mfa_enabled: true },
    });
    authorizationAbortSignal.mockResolvedValue({
      data: { sessionActive: true, mfaAllowed: false },
      error: null,
    });

    const result = await getAuthedUser(request());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
  });

  it("rejects an old AAL2 AMR epoch after replacement-factor verification", async () => {
    signedClaims({
      aal: "aal2",
      amr: [{ method: "totp", timestamp: 1_788_739_200 }],
      app_metadata: { mfa_enabled: true },
    });
    authorizationAbortSignal.mockResolvedValue({
      data: { sessionActive: true, mfaAllowed: false },
      error: null,
    });

    const result = await getAuthedUser(request());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith("auth_authorization_state", {
      p_user: USER_ID,
      p_session: SESSION_ID,
      p_aal: "aal2",
      p_amr: [{ method: "totp", timestamp: 1_788_739_200 }],
    });
  });

  it("keeps the recovery route available at AAL1 while checking its session", async () => {
    authorizationAbortSignal.mockResolvedValue({
      data: { sessionActive: true, mfaAllowed: false },
      error: null,
    });

    const result = await getAuthedUser(request(), { allowAal1: true });

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("rejects a revoked live session", async () => {
    authorizationAbortSignal.mockResolvedValue({
      data: { sessionActive: false, mfaAllowed: true },
      error: null,
    });

    const result = await getAuthedUser(request());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
  });

  it.each([undefined, "not-a-uuid"])(
    "rejects a missing or malformed session identifier (%s)",
    async (sessionId) => {
      signedClaims({ session_id: sessionId });

      const result = await getAuthedUser(request());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.response.status).toBe(401);
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the live authorization lookup fails", async () => {
    authorizationAbortSignal.mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });

    const result = await getAuthedUser(request());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(503);
  });

  it("fails closed when the live authorization response is malformed", async () => {
    authorizationAbortSignal.mockResolvedValue({
      data: { sessionActive: true },
      error: null,
    });

    const result = await getAuthedUser(request());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(503);
  });
});

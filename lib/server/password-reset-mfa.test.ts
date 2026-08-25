import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const updateUser = vi.fn();
let claims: Record<string, unknown> = {};

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () => ({ data: { claims }, error: null }),
      updateUser: (...args: unknown[]) => updateUser(...args),
    },
  }),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

const { POST } = await import("@/app/api/account/password/reset/route");

const VALID_PASSWORD = "Stronger9Password";

function call(body: unknown): Promise<Response> {
  return POST(
    new NextRequest("https://www.minddy.app/api/account/password/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  ) as unknown as Promise<Response>;
}

beforeEach(() => {
  claims = {
    sub: "user-1",
    email: "jane@example.com",
    aal: "aal1",
    app_metadata: { mfa_enabled: true },
  };
  updateUser.mockReset();
  updateUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
});

describe("POST /api/account/password/reset", () => {
  it("rejects a direct reset request before MFA completion", async () => {
    const response = await call({ password: VALID_PASSWORD });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "mfa_required" });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("ignores client-supplied MFA claims and trusts the signed session only", async () => {
    const response = await call({
      password: VALID_PASSWORD,
      mfaVerified: true,
      aal: "aal2",
    });

    expect(response.status).toBe(403);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("completes the reset with a verified AAL2 session", async () => {
    claims.aal = "aal2";
    claims.amr = [
      { method: "totp", timestamp: Math.floor(Date.now() / 1000) - 30 },
    ];

    const response = await call({ password: VALID_PASSWORD });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(updateUser).toHaveBeenCalledWith({ password: VALID_PASSWORD });
  });

  it("rejects a stale AAL2 session before changing the password", async () => {
    claims.aal = "aal2";
    claims.amr = [
      { method: "totp", timestamp: Math.floor(Date.now() / 1000) - 7200 },
    ];

    const response = await call({ password: VALID_PASSWORD });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "reauth_required" });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("keeps password reset available to accounts without MFA", async () => {
    claims.app_metadata = {};

    const response = await call({ password: VALID_PASSWORD });

    expect(response.status).toBe(200);
    expect(updateUser).toHaveBeenCalledOnce();
  });
});

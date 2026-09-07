import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The admin boundary revalidates the signed session against live Auth state.
 * This closes the access-token lifetime after role, allowlist, MFA, password,
 * or session revocation and never trusts user-writable metadata.
 */

const ADMIN = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";
const getUserById = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    auth: { admin: { getUserById } },
    rpc,
  }),
}));

const { isAdminUser } = await import("./admin");

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

function claims(overrides: Record<string, unknown> = {}) {
  return {
    sub: ADMIN,
    aal: "aal2",
    session_id: SESSION,
    amr: [{ method: "totp", timestamp: 1_788_739_200 }],
    ...overrides,
  };
}

beforeEach(() => {
  process.env.ADMIN_EMAILS = "boss@minddy.app, second@minddy.app";
  getUserById.mockReset();
  rpc.mockReset();
  getUserById.mockResolvedValue(account());
  rpc.mockResolvedValue({
    data: { sessionActive: true, mfaAllowed: true },
    error: null,
  });
});

describe("isAdminUser", () => {
  it("accepts a confirmed live allowlisted account with MFA and an active AAL2 session", async () => {
    await expect(isAdminUser({ id: ADMIN }, claims())).resolves.toBe(true);
    expect(getUserById).toHaveBeenCalledWith(ADMIN);
    expect(rpc).toHaveBeenCalledWith("auth_authorization_state", {
      p_user: ADMIN,
      p_session: SESSION,
      p_aal: "aal2",
      p_amr: [{ method: "totp", timestamp: 1_788_739_200 }],
    });
  });

  it("accepts the live admin role only with MFA and an active AAL2 session", async () => {
    getUserById.mockResolvedValue(
      account({
        email: undefined,
        email_confirmed_at: null,
        app_metadata: { role: "admin", mfa_enabled: true },
      }),
    );

    await expect(isAdminUser({ id: ADMIN }, claims())).resolves.toBe(true);
  });

  it("rejects an allowlisted address whose live account is unconfirmed", async () => {
    getUserById.mockResolvedValue(account({ email_confirmed_at: null }));

    await expect(isAdminUser({ id: ADMIN }, claims())).resolves.toBe(false);
  });

  it("compares the allowlist with the live account address", async () => {
    getUserById.mockResolvedValue(account({ email: "someone@example.test" }));

    await expect(isAdminUser({ id: ADMIN }, claims())).resolves.toBe(false);
  });

  it("rejects both admin sources when the live MFA flag is absent", async () => {
    getUserById.mockResolvedValue(
      account({ app_metadata: { role: "admin" } }),
    );
    await expect(isAdminUser({ id: ADMIN }, claims())).resolves.toBe(false);

    getUserById.mockResolvedValue(account({ app_metadata: {} }));
    await expect(isAdminUser({ id: ADMIN }, claims())).resolves.toBe(false);
  });

  it("rejects an admin whose live verified factor was removed", async () => {
    getUserById.mockResolvedValue(account({ factors: [] }));

    await expect(isAdminUser({ id: ADMIN }, claims())).resolves.toBe(false);
  });

  it("rejects a currently banned admin account", async () => {
    getUserById.mockResolvedValue(
      account({ banned_until: "2999-01-01T00:00:00.000Z" }),
    );

    await expect(isAdminUser({ id: ADMIN }, claims())).resolves.toBe(false);
  });

  it("rejects an old AAL1 token after MFA enrollment without privileged IO", async () => {
    await expect(
      isAdminUser({ id: ADMIN }, claims({ aal: "aal1" })),
    ).resolves.toBe(false);
    expect(getUserById).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a revoked session while its old AAL2 token is still signed", async () => {
    rpc.mockResolvedValue({
      data: { sessionActive: false, mfaAllowed: true },
      error: null,
    });

    await expect(isAdminUser({ id: ADMIN }, claims())).resolves.toBe(false);
  });

  it("rejects an old AAL2 AMR epoch after replacement-factor verification", async () => {
    rpc.mockResolvedValue({
      data: { sessionActive: true, mfaAllowed: false },
      error: null,
    });

    await expect(isAdminUser({ id: ADMIN }, claims())).resolves.toBe(false);
  });

  it("rejects mismatched subjects and missing or malformed session identifiers", async () => {
    await expect(
      isAdminUser({ id: ADMIN }, claims({ sub: OTHER_USER })),
    ).resolves.toBe(false);
    await expect(
      isAdminUser({ id: ADMIN }, claims({ session_id: undefined })),
    ).resolves.toBe(false);
    await expect(
      isAdminUser({ id: ADMIN }, claims({ session_id: "not-a-uuid" })),
    ).resolves.toBe(false);
    expect(getUserById).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a live account identifier that differs from the signed subject", async () => {
    getUserById.mockResolvedValue(account({ id: OTHER_USER }));

    await expect(isAdminUser({ id: ADMIN }, claims())).resolves.toBe(false);
  });

  it("rechecks live role and MFA state on every request", async () => {
    getUserById
      .mockResolvedValueOnce(
        account({
          email: "not-allowlisted@example.test",
          app_metadata: { role: "admin", mfa_enabled: true },
        }),
      )
      .mockResolvedValueOnce(
        account({
          email: "not-allowlisted@example.test",
          app_metadata: { role: "member", mfa_enabled: false },
        }),
      );

    await expect(isAdminUser({ id: ADMIN }, claims())).resolves.toBe(true);
    await expect(isAdminUser({ id: ADMIN }, claims())).resolves.toBe(false);
    expect(getUserById).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("fails closed when either live lookup fails", async () => {
    getUserById.mockRejectedValueOnce(new Error("Auth unavailable"));
    await expect(isAdminUser({ id: ADMIN }, claims())).resolves.toBe(false);

    getUserById.mockResolvedValue(account());
    rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    await expect(isAdminUser({ id: ADMIN }, claims())).resolves.toBe(false);
  });

  it("rejects a missing user", async () => {
    await expect(isAdminUser(null, claims())).resolves.toBe(false);
  });
});

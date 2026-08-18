import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-344 — the gate admin believed an UNCONFIRMED email.
 *
 * `ADMIN_EMAILS` compares an address, and the JWT carries one — but no claim
 * says it was confirmed. Registering with the address of an admin (the case
 * which counts: an admin listed but not yet registered) therefore gave the highest privilege
 * of the product to those who have never opened the corresponding mailbox.
 *
 * What these tests pinpoint: the only authoritative source is
 * `auth.users.email_confirmed_at`, read in service key — never a claim, and
 * especially not `user_metadata.email_verified`, which the user writes himself.
 * And fail-closed: a failed reading does not create an admin.
 */

const getUserById = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ auth: { admin: { getUserById } } }),
}));

const { isAdminUser, resetAdminConfirmationCache } = await import("./admin");

const ADMIN = "11111111-1111-4111-8111-111111111111";

function account(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      user: {
        id: ADMIN,
        email: "boss@minddy.app",
        email_confirmed_at: "2026-08-01T00:00:00.000Z",
        ...overrides,
      },
    },
    error: null,
  };
}

beforeEach(() => {
  process.env.ADMIN_EMAILS = "boss@minddy.app, second@minddy.app";
  getUserById.mockReset();
  getUserById.mockResolvedValue(account());
  resetAdminConfirmationCache();
});

describe("isAdminUser", () => {
  it("refuse une adresse d'admin dont le compte n'est pas confirmé", async () => {
    getUserById.mockResolvedValue(account({ email_confirmed_at: null }));
    const user = { id: ADMIN, email: "boss@minddy.app", app_metadata: {} };
    await expect(isAdminUser(user)).resolves.toBe(false);
  });

  it("accepte l'adresse d'admin d'un compte confirmé, casse comprise", async () => {
    const user = { id: ADMIN, email: "BOSS@Minddy.app", app_metadata: {} };
    await expect(isAdminUser(user)).resolves.toBe(true);
  });

  it("ne croit pas un `email_verified` de user_metadata — il est écrit par l'utilisateur", async () => {
    getUserById.mockResolvedValue(
      account({ email_confirmed_at: null, user_metadata: { email_verified: true } }),
    );
    const user = {
      id: ADMIN,
      email: "boss@minddy.app",
      app_metadata: {},
      user_metadata: { email_verified: true },
    };
    await expect(isAdminUser(user)).resolves.toBe(false);
  });

  it("compare l'allowlist à l'adresse RÉELLE du compte, pas à celle du jeton", async () => {
    getUserById.mockResolvedValue(account({ email: "quelquun@ailleurs.com" }));
    const user = { id: ADMIN, email: "boss@minddy.app", app_metadata: {} };
    await expect(isAdminUser(user)).resolves.toBe(false);
  });

  it("ne consulte même pas GoTrue pour une adresse hors allowlist", async () => {
    const user = { id: ADMIN, email: "curieux@ailleurs.com", app_metadata: {} };
    await expect(isAdminUser(user)).resolves.toBe(false);
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("garde le rôle app_metadata comme chemin sans IO", async () => {
    const user = { id: ADMIN, email: undefined, app_metadata: { role: "admin" } };
    await expect(isAdminUser(user)).resolves.toBe(true);
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("fail-closed : une lecture en panne ne donne pas l'accès", async () => {
    getUserById.mockRejectedValue(new Error("gotrue down"));
    const user = { id: ADMIN, email: "boss@minddy.app", app_metadata: {} };
    await expect(isAdminUser(user)).resolves.toBe(false);
  });

  it("ne met pas une panne en cache — le coup d'après retente", async () => {
    getUserById.mockRejectedValueOnce(new Error("gotrue down"));
    const user = { id: ADMIN, email: "boss@minddy.app", app_metadata: {} };
    await expect(isAdminUser(user)).resolves.toBe(false);
    await expect(isAdminUser(user)).resolves.toBe(true);
  });

  it("refuse sans session", async () => {
    await expect(isAdminUser(null)).resolves.toBe(false);
  });
});

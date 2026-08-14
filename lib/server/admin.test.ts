import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-344 — le gate admin croyait un e-mail NON CONFIRMÉ.
 *
 * `ADMIN_EMAILS` compare une adresse, et le JWT en porte une — mais aucun claim
 * ne dit qu'elle a été confirmée. S'inscrire avec l'adresse d'un admin (le cas
 * qui compte : un admin listé mais pas encore inscrit) donnait donc le privilège
 * le plus élevé du produit à qui n'a jamais ouvert la boîte mail correspondante.
 *
 * Ce que ces tests épinglent : la seule source qui fasse foi est
 * `auth.users.email_confirmed_at`, lue en clé de service — jamais un claim, et
 * surtout pas `user_metadata.email_verified`, que l'utilisateur écrit lui-même.
 * Et le fail-closed : une lecture en panne ne fabrique pas un admin.
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

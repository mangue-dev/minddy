import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  hasPasswordIdentity,
  isRecentlyAuthenticated,
  lastAuthenticationAt,
} from "./reauth";

/**
 * MIN-345 — deleting an account requires proof again.
 *
 * This gesture cascades the owned projects, their tickets and the access of
 * their members. An open session found on an unlocked workstation must
 * not be enough: the password when the account has one, recent authentication
 * when there is none.
 */

const NOW = 1_800_000_000;

describe("hasPasswordIdentity", () => {
  it("reconnaît un compte qui peut produire un mot de passe", () => {
    expect(hasPasswordIdentity({ providers: ["email"] })).toBe(true);
    expect(hasPasswordIdentity({ providers: ["google", "email"] })).toBe(true);
    expect(hasPasswordIdentity({ provider: "email" })).toBe(true);
  });

  it("laisse un compte OAuth seul en dehors — il n'a rien à ressaisir", () => {
    expect(hasPasswordIdentity({ providers: ["google"] })).toBe(false);
    expect(hasPasswordIdentity({ provider: "github" })).toBe(false);
    expect(hasPasswordIdentity(null)).toBe(false);
  });
});

describe("lastAuthenticationAt", () => {
  it("garde la méthode la plus récemment présentée", () => {
    expect(
      lastAuthenticationAt({
        amr: [
          { method: "oauth", timestamp: NOW - 500 },
          { method: "totp", timestamp: NOW - 10 },
        ],
        iat: NOW,
      })
    ).toBe(NOW - 10);
  });

  /** Assumed withdrawal: less solid, but it does not lock anyone out. */
  it("retombe sur `iat` quand le jeton ne porte pas d'amr", () => {
    expect(lastAuthenticationAt({ iat: NOW })).toBe(NOW);
    expect(lastAuthenticationAt({})).toBeNull();
  });
});

describe("isRecentlyAuthenticated", () => {
  it("accepte une connexion du quart d'heure", () => {
    expect(
      isRecentlyAuthenticated({ amr: [{ method: "oauth", timestamp: NOW - 60 }] }, NOW)
    ).toBe(true);
  });

  it("refuse une session ouverte ce matin", () => {
    expect(
      isRecentlyAuthenticated({ amr: [{ method: "oauth", timestamp: NOW - 7200 }] }, NOW)
    ).toBe(false);
  });
});

// ── The road itself ─────────────────────────── ────────────────────────────

const passwordOk = vi.fn(async () => true);
const deleted: string[] = [];
let account = {
  id: "user-1",
  email: "jane@example.com",
  app_metadata: { providers: ["email"] } as Record<string, unknown>,
};
let claims: Record<string, unknown> = { amr: [{ method: "password", timestamp: 0 }] };

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({ ok: true, user: account, supabase: {}, claims }),
}));
vi.mock("@/lib/server/reauth", async () => {
  const actual = await vi.importActual<typeof import("./reauth")>("./reauth");
  return { ...actual, verifyAccountPassword: (...args: unknown[]) => passwordOk(...(args as [])) };
});
vi.mock("@/lib/server/account-deletion", () => ({
  deleteAccount: async (id: string) => {
    deleted.push(id);
    return { ok: true };
  },
}));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: () => {} }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

const { DELETE } = await import("@/app/api/account/route");

function call(body: unknown): Promise<Response> {
  return DELETE(
    new Request("https://www.minddy.app/api/account", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never
  ) as unknown as Promise<Response>;
}

// The flow of the road is counted PER USER: a new id in each case,
// otherwise the tests limit each other.
let seq = 0;

beforeEach(() => {
  deleted.length = 0;
  passwordOk.mockClear();
  passwordOk.mockResolvedValue(true);
  account = {
    id: `user-${++seq}`,
    email: "jane@example.com",
    app_metadata: { providers: ["email"] },
  };
  claims = { amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] };
});

describe("DELETE /api/account", () => {
  it("supprime avec l'adresse ET le mot de passe", async () => {
    const response = await call({ confirm: "jane@example.com", password: "hunter2" });
    expect(response.status).toBe(200);
    expect(deleted).toEqual([account.id]);
  });

  it("refuse sans mot de passe, même avec l'adresse recopiée", async () => {
    const response = await call({ confirm: "jane@example.com" });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "reauth_required" });
    expect(deleted).toEqual([]);
  });

  it("refuse un mauvais mot de passe", async () => {
    passwordOk.mockResolvedValue(false);
    const response = await call({ confirm: "jane@example.com", password: "nope" });
    expect(response.status).toBe(403);
    expect(deleted).toEqual([]);
  });

  it("compte OAuth : exige une connexion récente, pas un mot de passe", async () => {
    account.app_metadata = { providers: ["google"] };
    claims = { amr: [{ method: "oauth", timestamp: Math.floor(Date.now() / 1000) - 7200 }] };
    const stale = await call({ confirm: "jane@example.com" });
    expect(stale.status).toBe(403);
    expect(passwordOk).not.toHaveBeenCalled();

    claims = { amr: [{ method: "oauth", timestamp: Math.floor(Date.now() / 1000) - 30 }] };
    const fresh = await call({ confirm: "jane@example.com" });
    expect(fresh.status).toBe(200);
    expect(deleted).toEqual([account.id]);
  });
});

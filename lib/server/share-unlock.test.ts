import { beforeEach, describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";

import { hashSharePassword, unlockCookieValue } from "@/lib/server/view-shares";

/**
 * MIN-283 — the door to a password-protected share, written once
 * for both public surfaces (shared view, published page).
 *
 * What is checked here is what really protects: a bad password
 * does not set a cookie, a good one does. one linked to THIS sharing, and the cookie
 * ceases to be valid as soon as the password changes — without any session
 * being held anywhere.
 *
 * MIN-347 adds the two brakes that were missing: the cookie compares itself in
 * constant time (it was a `===`), and failures are counted in BASIC — the
 * counter in memory restarts from zero each time it is deployed, on the sole
 * door of the product whose secret lies in a hand-chosen password.
 */

const target = { current: null as unknown };
const cookieJar = new Map<string, string>();
const setCookie = vi.fn((name: string, value: string) => cookieJar.set(name, value));
let rateAllowed = true;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined,
    set: (name: string, value: string) => setCookie(name, value),
  }),
  headers: async () => new Map([["x-forwarded-for", "203.0.113.7"]]),
}));

vi.mock("@/lib/server/session-rate-limit", () => ({
  checkSessionRateLimit: () => ({ allowed: rateAllowed }),
}));

let attemptsLeft = true;
const recordFailure = vi.fn();
const clearFailures = vi.fn();

vi.mock("@/lib/server/share-unlock-attempts", () => ({
  shareUnlockAttemptsLeft: async () => attemptsLeft,
  recordShareUnlockFailure: (...args: unknown[]) => recordFailure(...args),
  clearShareUnlockFailures: (...args: unknown[]) => clearFailures(...args),
}));

vi.mock("@/lib/server/custom-domains", () => ({
  isCustomPublicHost: async () => false,
  publicCookiePath: (_custom: boolean, path: string) => path,
}));

vi.mock("@/lib/server/view-shares", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/view-shares")>()),
  getPublicShareTarget: async () => target.current,
}));

const { isShareUnlocked, unlockShareWithPassword } = await import(
  "@/lib/server/share-unlock"
);

const { salt, hash } = hashSharePassword("ouvre-toi");

function passwordShare() {
  return {
    kind: "page" as const,
    share: {
      id: "share-1",
      token: "tok",
      level: "password" as const,
      password_salt: salt,
      password_hash: hash,
    },
  };
}

beforeEach(() => {
  cookieJar.clear();
  setCookie.mockClear();
  rateAllowed = true;
  attemptsLeft = true;
  recordFailure.mockClear();
  clearFailures.mockClear();
  target.current = passwordShare();
});

describe("unlockShareWithPassword", () => {
  it("refuse un mauvais mot de passe sans rien poser", async () => {
    const result = await unlockShareWithPassword({
      token: "tok",
      password: "au-hasard",
      cookiePath: "/p/tok",
    });
    expect(result).toEqual({ ok: false, error: "wrongPassword" });
    expect(setCookie).not.toHaveBeenCalled();
    // The failure is placed in the base: it is the one that survives the next deployment.
    expect(recordFailure).toHaveBeenCalledWith("share-1", "203.0.113.7");
  });

  it("s'arrête sur le compteur PERSISTANT, avant de dériver quoi que ce soit", async () => {
    attemptsLeft = false;
    const result = await unlockShareWithPassword({
      token: "tok",
      password: "ouvre-toi",
      cookiePath: "/p/tok",
    });
    expect(result).toEqual({ ok: false, error: "tooManyAttempts" });
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("refuse un token inconnu comme un mauvais mot de passe", async () => {
    target.current = null;
    const result = await unlockShareWithPassword({
      token: "inconnu",
      password: "ouvre-toi",
      cookiePath: "/p/inconnu",
    });
    // The same refusal: the response does not say if the sharing exists.
    expect(result).toEqual({ ok: false, error: "wrongPassword" });
  });

  it("s'arrête sur la limite de tentatives avant même de dériver", async () => {
    rateAllowed = false;
    const result = await unlockShareWithPassword({
      token: "tok",
      password: "ouvre-toi",
      cookiePath: "/p/tok",
    });
    expect(result).toEqual({ ok: false, error: "tooManyAttempts" });
  });

  it("pose le cookie du partage sur le bon mot de passe", async () => {
    const result = await unlockShareWithPassword({
      token: "tok",
      password: "ouvre-toi",
      cookiePath: "/p/tok",
    });
    expect(result).toEqual({ ok: true });
    expect(setCookie).toHaveBeenCalledWith(
      "mdy_share_unlock",
      unlockCookieValue("tok", hash)
    );
    expect(await isShareUnlocked(passwordShare().share)).toBe(true);
    // Making mistakes before finding leaves no debt.
    expect(clearFailures).toHaveBeenCalledWith("share-1", "203.0.113.7");
  });

  it("laisse passer un partage devenu public : il n'y a plus rien à ouvrir", async () => {
    target.current = {
      kind: "page" as const,
      share: {
        id: "share-1",
        token: "tok",
        level: "public",
        password_salt: null,
        password_hash: null,
      },
    };
    expect(
      await unlockShareWithPassword({ token: "tok", password: "", cookiePath: "/p/tok" })
    ).toEqual({ ok: true });
    expect(setCookie).not.toHaveBeenCalled();
  });
});

describe("isShareUnlocked", () => {
  it("ouvre un partage public sans cookie", async () => {
    expect(
      await isShareUnlocked({ level: "public", token: "tok", password_hash: null })
    ).toBe(true);
  });

  it("ferme un partage à mot de passe tant que le cookie ne correspond pas", async () => {
    expect(await isShareUnlocked(passwordShare().share)).toBe(false);
    cookieJar.set("mdy_share_unlock", "n'importe quoi");
    expect(await isShareUnlocked(passwordShare().share)).toBe(false);
  });

  it("invalide les cookies en circulation quand le mot de passe change", async () => {
    cookieJar.set("mdy_share_unlock", unlockCookieValue("tok", hash));
    expect(await isShareUnlocked(passwordShare().share)).toBe(true);
    const next = hashSharePassword("un-autre");
    expect(
      await isShareUnlocked({
        level: "password",
        token: "tok",
        password_hash: next.hash,
      })
    ).toBe(false);
  });
});

describe("la comparaison du cookie", () => {
  it("ne passe plus par un `===` sur le secret", () => {
    // Structural test: the constant time comparison is not visible
    // execution, only the code says if it is there. What is kept is
    // that no `===` ever changes the value of the cookie.
    const source = readFileSync("lib/server/share-unlock.ts", "utf8");
    expect(source).not.toMatch(/cookie\s*===/);
    expect(source).toContain("unlockCookieMatches");
  });

  it("refuse une valeur de la bonne longueur mais fausse, et une trop courte", async () => {
    const { share } = passwordShare();
    const good = unlockCookieValue("tok", hash);
    cookieJar.set("mdy_share_unlock", `${good.slice(0, -1)}${good.at(-1) === "0" ? "1" : "0"}`);
    expect(await isShareUnlocked(share)).toBe(false);
    cookieJar.set("mdy_share_unlock", good.slice(0, 10));
    expect(await isShareUnlocked(share)).toBe(false);
    cookieJar.set("mdy_share_unlock", "");
    expect(await isShareUnlocked(share)).toBe(false);
  });
});

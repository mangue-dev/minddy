import { beforeEach, describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";

import { hashSharePassword, unlockCookieValue } from "@/lib/server/view-shares";

/**
 * MIN-283 — la porte d'un partage protégé par mot de passe, écrite une fois
 * pour les deux surfaces publiques (vue partagée, page publiée).
 *
 * Ce qui est vérifié ici est ce qui protège vraiment : un mauvais mot de passe
 * ne pose pas de cookie, un bon en pose un lié à CE partage, et le cookie
 * cesse de valoir dès que le mot de passe change — sans qu'aucune session ne
 * soit tenue nulle part.
 *
 * MIN-347 y ajoute les deux freins qui manquaient : le cookie se compare en
 * temps constant (c'était un `===`), et les échecs se comptent en BASE — le
 * compteur en mémoire repartait à zéro à chaque déploiement, sur la seule porte
 * du produit dont le secret tient dans un mot de passe choisi à la main.
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
    // L'échec est rangé en base : c'est lui qui survit au déploiement suivant.
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
    // Le même refus : la réponse ne dit pas si le partage existe.
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
    // Se tromper avant de trouver ne laisse pas de dette.
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
    // Test structurel : la comparaison en temps constant ne se voit pas à
    // l'exécution, seul le code dit si elle est là. Ce qui est gardé, c'est
    // qu'aucun `===` ne revienne un jour sur la valeur du cookie.
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

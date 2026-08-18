import { describe, expect, it } from "vitest";
import {
  carrySessionCookies,
  isSessionCookie,
  staleSessionCookies,
  type SourceCookie,
} from "./session-carry";

const REF = "cmzrlbnlytvgnomzgmqf";
const PREVIEW = "https://preview.minddy.app";

describe("isSessionCookie", () => {
  it("retient le cookie de session et tous ses morceaux", () => {
    expect(isSessionCookie(`sb-${REF}-auth-token`)).toBe(true);
    expect(isSessionCookie(`sb-${REF}-auth-token.0`)).toBe(true);
    expect(isSessionCookie(`sb-${REF}-auth-token.12`)).toBe(true);
  });

  it("laisse le vérificateur PKCE là où il a été tiré", () => {
    expect(isSessionCookie(`sb-${REF}-auth-token-code-verifier`)).toBe(false);
  });

  it("ne touche pas aux réglages de l'origine", () => {
    for (const name of ["NEXT_LOCALE", "minddy-cookie-consent", "sb-provider-token"]) {
      expect(isSessionCookie(name)).toBe(false);
    }
  });
});

describe("carrySessionCookies", () => {
  const source: SourceCookie[] = [
    { name: `sb-${REF}-auth-token.0`, value: "base64-part-1", expirationDate: 1_800_000_000 },
    { name: `sb-${REF}-auth-token.1`, value: "base64-part-2", expirationDate: 1_800_000_000 },
    { name: "NEXT_LOCALE", value: "fr" },
  ];

  it("emporte tous les morceaux, et rien d'autre", () => {
    const carried = carrySessionCookies(source, PREVIEW);
    expect(carried.map((cookie) => cookie.name)).toEqual([
      `sb-${REF}-auth-token.0`,
      `sb-${REF}-auth-token.1`,
    ]);
    expect(carried[0]).toMatchObject({
      url: PREVIEW,
      value: "base64-part-1",
      path: "/",
      secure: true,
      // The browser's Supabase client reads them back in JavaScript.
      httpOnly: false,
      sameSite: "lax",
      expirationDate: 1_800_000_000,
    });
  });

  it("déduit `secure` de l'origine d'ARRIVÉE, pas de celle de départ", () => {
    // Local dev is in bare HTTP: an unconditional `Secure` would do that
    // disappear the session that has just been postponed.
    const [carried] = carrySessionCookies(source, "http://localhost:3000");
    expect(carried.secure).toBe(false);
  });

  it("laisse un cookie de session mourir avec l'app", () => {
    const [carried] = carrySessionCookies(
      [{ name: `sb-${REF}-auth-token`, value: "x" }],
      PREVIEW
    );
    expect(carried).not.toHaveProperty("expirationDate");
  });
});

describe("staleSessionCookies", () => {
  it("efface les morceaux que la nouvelle session ne réécrira pas", () => {
    // Three pieces on arrival, two arriving: without that the `.2` of
    // the old one sticks to the new one, and the session becomes unreadable.
    const target: SourceCookie[] = [
      { name: `sb-${REF}-auth-token.0`, value: "vieux" },
      { name: `sb-${REF}-auth-token.1`, value: "vieux" },
      { name: `sb-${REF}-auth-token.2`, value: "vieux" },
      { name: "NEXT_LOCALE", value: "en" },
    ];
    const carried = carrySessionCookies(
      [
        { name: `sb-${REF}-auth-token.0`, value: "neuf" },
        { name: `sb-${REF}-auth-token.1`, value: "neuf" },
      ],
      PREVIEW
    );
    expect(staleSessionCookies(target, carried)).toEqual([`sb-${REF}-auth-token.2`]);
  });

  it("ne retire pas ce qui va être écrasé de toute façon", () => {
    const target: SourceCookie[] = [{ name: `sb-${REF}-auth-token`, value: "vieux" }];
    const carried = carrySessionCookies(
      [{ name: `sb-${REF}-auth-token`, value: "neuf" }],
      PREVIEW
    );
    expect(staleSessionCookies(target, carried)).toEqual([]);
  });
});

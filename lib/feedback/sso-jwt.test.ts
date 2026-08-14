import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SSO_MAX_TTL_SECONDS,
  signFeedbackSsoJwt,
  verifyFeedbackSsoJwt,
} from "./sso-jwt";

const SECRET = "test-sso-secret";
const NOW = 1_800_000_000;

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(
  payload: Record<string, unknown>,
  secret: string = SECRET,
  header: Record<string, unknown> = { alg: "HS256", typ: "JWT" }
): string {
  const head = b64url(header);
  const body = b64url(payload);
  const signature = createHmac("sha256", secret)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${signature}`;
}

describe("verifyFeedbackSsoJwt", () => {
  it("accepts a valid token and normalizes claims", () => {
    const token = sign({
      sub: " user-42 ",
      email: "Jane@Example.COM",
      name: " Jane ",
      exp: NOW + 300,
    });
    const result = verifyFeedbackSsoJwt(token, SECRET, NOW);
    expect(result).toMatchObject({
      ok: true,
      claims: { externalId: "user-42", email: "jane@example.com", name: "Jane" },
      expiresAt: NOW + 300,
    });
  });

  it("accepts a token without email/name", () => {
    const token = sign({ sub: "user-1", exp: NOW + 60 });
    const result = verifyFeedbackSsoJwt(token, SECRET, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.email).toBeNull();
      expect(result.claims.name).toBeNull();
    }
  });

  it("rejects a bad signature", () => {
    const token = sign({ sub: "user-1", exp: NOW + 60 }, "wrong-secret");
    expect(verifyFeedbackSsoJwt(token, SECRET, NOW)).toEqual({
      ok: false,
      error: "bad_signature",
    });
  });

  it("rejects an expired token", () => {
    const token = sign({ sub: "user-1", exp: NOW - 1 });
    expect(verifyFeedbackSsoJwt(token, SECRET, NOW)).toEqual({
      ok: false,
      error: "expired",
    });
  });

  it("rejects a token without exp", () => {
    const token = sign({ sub: "user-1" });
    expect(verifyFeedbackSsoJwt(token, SECRET, NOW)).toEqual({
      ok: false,
      error: "expired",
    });
  });

  it("rejects a token without sub", () => {
    const token = sign({ exp: NOW + 60 });
    expect(verifyFeedbackSsoJwt(token, SECRET, NOW)).toEqual({
      ok: false,
      error: "missing_sub",
    });
  });

  it("rejects non-HS256 algorithms (alg confusion)", () => {
    const token = sign({ sub: "user-1", exp: NOW + 60 }, SECRET, {
      alg: "none",
      typ: "JWT",
    });
    expect(verifyFeedbackSsoJwt(token, SECRET, NOW)).toEqual({
      ok: false,
      error: "malformed",
    });
  });

  /**
   * Le plafond de durée de vie ne vivait que dans le signeur — du code que le
   * client N'EXÉCUTE PAS, c'est son backend qui signe (MIN-345).
   */
  it("rejects a token whose exp is beyond the 10 min cap", () => {
    const token = sign({ sub: "user-1", exp: NOW + 86_400 });
    expect(verifyFeedbackSsoJwt(token, SECRET, NOW)).toEqual({
      ok: false,
      error: "ttl_too_long",
    });
  });

  it("tolerates a signer's clock a minute ahead", () => {
    const token = sign({ sub: "user-1", exp: NOW + SSO_MAX_TTL_SECONDS + 30 });
    expect(verifyFeedbackSsoJwt(token, SECRET, NOW).ok).toBe(true);
  });

  /** L'identifiant de consommation dérive de la signature : deux jetons
      distincts ne peuvent pas partager le sien, le même jeton le garde. */
  it("derives a stable, per-token id to consume", () => {
    const token = sign({ sub: "user-1", exp: NOW + 60 });
    const other = sign({ sub: "user-2", exp: NOW + 60 });
    const first = verifyFeedbackSsoJwt(token, SECRET, NOW);
    const again = verifyFeedbackSsoJwt(token, SECRET, NOW + 1);
    const second = verifyFeedbackSsoJwt(other, SECRET, NOW);
    if (!first.ok || !again.ok || !second.ok) throw new Error("expected valid tokens");
    expect(first.tokenId).toBe(again.tokenId);
    expect(first.tokenId).not.toBe(second.tokenId);
  });

  it("rejects malformed input", () => {
    expect(verifyFeedbackSsoJwt("not-a-jwt", SECRET, NOW)).toEqual({
      ok: false,
      error: "malformed",
    });
    expect(verifyFeedbackSsoJwt("a.b", SECRET, NOW)).toEqual({
      ok: false,
      error: "malformed",
    });
    expect(verifyFeedbackSsoJwt("", SECRET, NOW)).toEqual({
      ok: false,
      error: "malformed",
    });
  });
});

describe("signFeedbackSsoJwt", () => {
  it("round-trips through verifyFeedbackSsoJwt with normalized claims", () => {
    const token = signFeedbackSsoJwt(
      { sub: "user-42", email: "Jane@Example.COM", name: "Jane" },
      SECRET,
      NOW
    );
    expect(verifyFeedbackSsoJwt(token, SECRET, NOW)).toMatchObject({
      ok: true,
      claims: { externalId: "user-42", email: "jane@example.com", name: "Jane" },
    });
  });

  /** Deux jetons aux mêmes claims, signés dans la même seconde, doivent rester
      DEUX jetons : sinon le double-clic passe pour un rejeu (MIN-345). */
  it("never signs the same token twice for the same claims", () => {
    const a = signFeedbackSsoJwt({ sub: "user-1" }, SECRET, NOW);
    const b = signFeedbackSsoJwt({ sub: "user-1" }, SECRET, NOW);
    expect(a).not.toBe(b);
    const first = verifyFeedbackSsoJwt(a, SECRET, NOW);
    const second = verifyFeedbackSsoJwt(b, SECRET, NOW);
    if (!first.ok || !second.ok) throw new Error("expected valid tokens");
    expect(first.tokenId).not.toBe(second.tokenId);
  });

  it("defaults exp to now + 10 min", () => {
    const token = signFeedbackSsoJwt({ sub: "user-1" }, SECRET, NOW);
    // Still valid at +599s, expired at +601s.
    expect(verifyFeedbackSsoJwt(token, SECRET, NOW + 599).ok).toBe(true);
    expect(verifyFeedbackSsoJwt(token, SECRET, NOW + 601)).toEqual({
      ok: false,
      error: "expired",
    });
  });

  it("caps a longer requested TTL to the 10 min maximum", () => {
    const token = signFeedbackSsoJwt(
      { sub: "user-1", ttlSeconds: 3600 },
      SECRET,
      NOW
    );
    expect(verifyFeedbackSsoJwt(token, SECRET, NOW + SSO_MAX_TTL_SECONDS + 1)).toEqual({
      ok: false,
      error: "expired",
    });
  });

  it("omits email/name when absent", () => {
    const token = signFeedbackSsoJwt({ sub: "user-1" }, SECRET, NOW);
    const result = verifyFeedbackSsoJwt(token, SECRET, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.email).toBeNull();
      expect(result.claims.name).toBeNull();
    }
  });

  it("is rejected by verify under a different secret", () => {
    const token = signFeedbackSsoJwt({ sub: "user-1" }, SECRET, NOW);
    expect(verifyFeedbackSsoJwt(token, "other-secret", NOW)).toEqual({
      ok: false,
      error: "bad_signature",
    });
  });
});

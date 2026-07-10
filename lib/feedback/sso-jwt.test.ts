import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyFeedbackSsoJwt } from "./sso-jwt";

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
    expect(result).toEqual({
      ok: true,
      claims: { externalId: "user-42", email: "jane@example.com", name: "Jane" },
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

import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * OAuth server crypto primitives. All secrets (codes, tokens) are
 * opaque: readable prefix + 32 random base64 bytes, and only the
 * sha256 hex is persisted (pattern api_keys). Distinct prefixes so that
 * any paste in the wrong place fails quickly and the logs are readable.
 */

export const ACCESS_TOKEN_PREFIX = "mdyat_";
export const REFRESH_TOKEN_PREFIX = "mdyrt_";
export const CODE_PREFIX = "mdyac_";
export const CLIENT_ID_PREFIX = "mdyc_";

/** sha256 hex — the only ever persisted form of a secret. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateSecret(prefix: string): { value: string; hash: string } {
  const value = prefix + randomBytes(32).toString("base64url");
  return { value, hash: sha256Hex(value) };
}

export function generateClientId(): string {
  return CLIENT_ID_PREFIX + randomBytes(12).toString("base64url");
}

// RFC 7636 §4.1: charset and length of code_verifier.
const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;

/** PKCE S256 verification: base64url(sha256(verifier)) === challenge,
 in constant time. Only S256 is accepted (never "plain"). */
export function verifyPkceS256(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== "string" || !VERIFIER_RE.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

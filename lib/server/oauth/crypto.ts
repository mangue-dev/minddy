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

/** Derives an RFC 7636 S256 challenge, or null for an invalid verifier. */
export function pkceS256Challenge(verifier: unknown): string | null {
  if (typeof verifier !== "string" || !VERIFIER_RE.test(verifier)) return null;
  return createHash("sha256").update(verifier).digest("base64url");
}

/** PKCE S256 verification in constant time. Only S256 is accepted. */
export function verifyPkceS256(verifier: unknown, challenge: string): boolean {
  const computed = pkceS256Challenge(verifier);
  if (!computed) return false;
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Primitives crypto du serveur OAuth. Tous les secrets (codes, tokens) sont
 * opaques : préfixe lisible + 32 octets aléatoires base64url, et seul le
 * sha256 hex est persisté (pattern api_keys). Préfixes distincts pour que
 * tout collage au mauvais endroit échoue vite et que les logs soient lisibles.
 */

export const ACCESS_TOKEN_PREFIX = "mdyat_";
export const REFRESH_TOKEN_PREFIX = "mdyrt_";
export const CODE_PREFIX = "mdyac_";
export const CLIENT_ID_PREFIX = "mdyc_";

/** sha256 hex — la seule forme jamais persistée d'un secret. */
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

// RFC 7636 §4.1 : charset et longueur du code_verifier.
const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;

/** Vérification PKCE S256 : base64url(sha256(verifier)) === challenge,
    en temps constant. Seul S256 est accepté (jamais "plain"). */
export function verifyPkceS256(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== "string" || !VERIFIER_RE.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Clés d'intégration (API Feedback) : "mdy_" + 24 octets aléatoires en
 * base64url. Seul le sha256 hex est stocké — le plaintext n'est montré qu'une
 * fois, à la création. key_prefix garde les premiers caractères pour que
 * l'owner reconnaisse sa clé dans la liste des settings.
 */

export const INTEGRATION_KEY_PREFIX = "mdy_";

/** sha256 hex de la clé présentée — la seule forme jamais persistée. */
export function hashIntegrationKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateIntegrationKey(): {
  key: string;
  hash: string;
  prefix: string;
} {
  const key = INTEGRATION_KEY_PREFIX + randomBytes(24).toString("base64url");
  return { key, hash: hashIntegrationKey(key), prefix: key.slice(0, 11) };
}

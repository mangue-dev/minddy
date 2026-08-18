import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Integration keys (API Feedback): "mdy_" + 24 random bytes en
 * base64url. Only the sha256 hex is stored — the plaintext is only shown once, upon creation. key_prefix keeps the first characters so that
 * the owner recognizes his key in the settings list.
 */

export const INTEGRATION_KEY_PREFIX = "mdy_";

/** sha256 hex of the presented key — the only form ever persisted. */
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

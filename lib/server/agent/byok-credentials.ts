import "server-only";
import { requireSecret } from "@/lib/server/env-secrets";

import { decrypt, encrypt, isEncryptedEnvelope } from "@/lib/server/encryption";

/**
 * At-rest encryption of OpenRouter "BYOK" keys that users
 * provide (MIN-46 / MIN-10). Same AES-256-GCM envelope as git
 * tokens (lib/server/encryption.ts) but with a dedicated secret: the stored ciphertext
 * is `JSON.stringify(encrypt(plain, secret))`, stored in
 * user_ai_keys.key_encrypted (service-role only). The key never leaves
 * the server and is never logged in clear text.
 *
 * Fail-closed: secret absent → removed during encryption (we NEVER store a key
 * in clear text); decryption returns null (never an exception) → a secret
 * turned translates to "reconfigure your key" upstream rather than a crash.
 */
function getAiKeySecret(): string {
  // Absent OR too short: the same refusal (MIN-347). An AES key derived from a
  // three character secret is no better than these three characters.
  return requireSecret("AI_KEY_ENCRYPTION_SECRET");
}

/**
 * Non-sensitive state stored for a local endpoint without authentication. The
 * historical column `key_encrypted` is `NOT NULL` in certain instances:
 * this marker therefore allows Ollama to be registered immediately, without requiring a
 * key or prior migration. It is never sent to the provider.
 */
export const LOCAL_ENDPOINT_WITHOUT_API_KEY = "minddy:local-endpoint-without-api-key:v1";

export function encryptUserAiKey(plain: string): string {
  return JSON.stringify(encrypt(plain, getAiKeySecret()));
}

export function decryptUserAiKey(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null;
  let envelope: unknown;
  try {
    envelope = JSON.parse(encrypted);
  } catch {
    return null;
  }
  if (!isEncryptedEnvelope(envelope)) return null;
  try {
    return decrypt(envelope, getAiKeySecret());
  } catch (err) {
    console.warn(
      `[byok-credentials] failed to decrypt key: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

/** Non-sensitive preview of a key for display (prefix + ellipse). */
export function keyPrefix(plain: string): string {
  const trimmed = plain.trim();
  if (trimmed.length <= 12) return `${trimmed.slice(0, 4)}…`;
  return `${trimmed.slice(0, 12)}…`;
}

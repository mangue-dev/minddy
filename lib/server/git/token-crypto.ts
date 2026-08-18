import "server-only";

import { decrypt, encrypt, isEncryptedEnvelope } from "@/lib/server/encryption";
import { hasStrongSecret, requireSecret } from "@/lib/server/env-secrets";

/**
 * At-rest encryption of forge tokens (MIN-47, generalized to MIN-144).
 * AES-256-GCM envelope (lib/server/encryption.ts): the stored ciphertext is
 * `JSON.stringify(encrypt(plaintext, secret))`, stored in
 * `git_connections.access_token_encrypted` / `refresh_token_encrypted` (OAuth
 * GitLab) and `git_user_identities.*` (user-to-server token GitHub) — columns
 * service-role only. The tokens never leave the server and are
 * never logged in the clear.
 *
 * The secret is now called `GIT_TOKEN_ENCRYPTION_SECRET`, with fallback to
 * `GITLAB_TOKEN_ENCRYPTION_SECRET`: the envelopes already in the base have been
 * sealed with the old one, and the scrypt derivation starts from secrecy — renaming it to
 * without fallback would make all existing GitLab connections unreadable. A
 * prod which only sets the old name therefore continues to work, without doing anything.
 *
 * Fail-closed: an absent secret raises (we NEVER store a token in clear);
 * decryption returns null (never an exception) so that a secret is turned or
 * a corrupted envelope results in an upstream reconnect prompt.
 */
function getForgeTokenSecret(): string {
  // The fallback to the old name lives in the secret spec (`aliases`), with the
  // minimum length — absent OR too short, same refusal (MIN-347).
  return requireSecret("GIT_TOKEN_ENCRYPTION_SECRET");
}

/** Is an encryption secret deployed and usable? (config. guard) */
export function isForgeTokenCryptoConfigured(): boolean {
  return hasStrongSecret("GIT_TOKEN_ENCRYPTION_SECRET");
}

export function encryptForgeToken(plain: string): string {
  return JSON.stringify(encrypt(plain, getForgeTokenSecret()));
}

export function decryptForgeToken(
  encrypted: string | null | undefined,
): string | null {
  if (!encrypted) return null;
  let envelope: unknown;
  try {
    envelope = JSON.parse(encrypted);
  } catch {
    return null;
  }
  if (!isEncryptedEnvelope(envelope)) return null;
  try {
    return decrypt(envelope, getForgeTokenSecret());
  } catch (err) {
    console.warn(
      `[token-crypto] failed to decrypt token: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

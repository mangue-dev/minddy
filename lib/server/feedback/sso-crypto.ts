import "server-only";
import { hasStrongSecret, requireSecret } from "@/lib/server/env-secrets";

import { decrypt, encrypt, isEncryptedEnvelope } from "@/lib/server/encryption";

/**
 * At-rest encryption of a board's SSO secret (MIN-119).
 *
 * `feedback_boards.sso_secret` is the HS256 shared secret with which the publisher's backend signs the identity of its users. Whoever owns it
 * can forge the identity of ANY visitor to the board — so write and
 * vote under someone else's address. However, it lived in the clear, alone
 * product secret in this case: the forge tokens and the AI “BYOK” keys
 * carry the same AES-256-GCM envelope since MIN-47 and MIN-46.
 *
 * It remains redisplayable to the owner, and that's the point: a shared secret
 * that cannot be reread is a secret that must be rotated each time you lose
 * post-it notes. It is this need — reversible, not verifiable — that calls for a
 * encryption rather than a fingerprint.
 *
 * COMPATIBILITY. `readBoardSsoSecret` accepts a value that is not a
 * envelope: this is a secret from before this switch, rendered as is. The
 * readings of `lib/server/feedback/boards.ts` reseal it in passing, so an active
 * board updates itself on its first visit.
 *
 * Fail-closed on writing (env secret absent → raised): we never store en
 * clear. Decryption renders null rather than raising — a secret of env
 * turned translates into “regenerate your SSO secret” and not by a board of 500.
 */

function getSsoEncryptionSecret(): string {
  // Absent OR too short: the same refusal (MIN-347).
  return requireSecret("FEEDBACK_SSO_ENCRYPTION_SECRET");
}

/** Is the encryption secret deployed and usable? (config. guard) */
export function isSsoCryptoConfigured(): boolean {
  return hasStrongSecret("FEEDBACK_SSO_ENCRYPTION_SECRET");
}

export function encryptBoardSsoSecret(plain: string): string {
  return JSON.stringify(encrypt(plain, getSsoEncryptionSecret()));
}

export interface BoardSsoSecretRead {
  /** The usable secret, or null if it is unreadable. */
  plain: string | null;
  /** True when the stored value was in plain text (secret before MIN-119). */
  legacy: boolean;
}

export function readBoardSsoSecret(
  stored: string | null | undefined
): BoardSsoSecretRead {
  if (!stored) return { plain: null, legacy: false };

  let envelope: unknown;
  try {
    envelope = JSON.parse(stored);
  } catch {
    // Not JSON: it's a `fbsso_…` from before encryption.
    return { plain: stored, legacy: true };
  }
  if (!isEncryptedEnvelope(envelope)) return { plain: stored, legacy: true };

  try {
    return { plain: decrypt(envelope, getSsoEncryptionSecret()), legacy: false };
  } catch (err) {
    console.warn(
      `[feedback-sso-crypto] failed to decrypt board secret: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return { plain: null, legacy: false };
  }
}

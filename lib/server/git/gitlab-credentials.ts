import "server-only";

import { decrypt, encrypt, isEncryptedEnvelope } from "@/lib/server/encryption";

/**
 * Chiffrement au repos des tokens OAuth GitLab (MIN-47). Enveloppe AES-256-GCM
 * (lib/server/encryption.ts) avec un secret dédié : le ciphertext stocké est
 * `JSON.stringify(encrypt(plaintext, secret))`, rangé dans
 * git_connections.access_token_encrypted / refresh_token_encrypted (service-role
 * uniquement). Les tokens ne quittent jamais le serveur et ne sont jamais logués
 * en clair.
 *
 * Fail-closed : un secret absent lève (on ne stocke JAMAIS un token en clair) ;
 * le déchiffrement renvoie null (jamais d'exception) pour qu'un secret tourné ou
 * une enveloppe corrompue se traduise par une invite de reconnexion en amont.
 */
function getGitlabTokenSecret(): string {
  const secret = process.env.GITLAB_TOKEN_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "Missing GITLAB_TOKEN_ENCRYPTION_SECRET for GitLab token encryption",
    );
  }
  return secret;
}

export function encryptGitlabToken(plain: string): string {
  return JSON.stringify(encrypt(plain, getGitlabTokenSecret()));
}

export function decryptGitlabToken(
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
    return decrypt(envelope, getGitlabTokenSecret());
  } catch (err) {
    console.warn(
      `[gitlab-credentials] failed to decrypt token: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

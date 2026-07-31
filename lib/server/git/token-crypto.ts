import "server-only";

import { decrypt, encrypt, isEncryptedEnvelope } from "@/lib/server/encryption";

/**
 * Chiffrement au repos des tokens de forge (MIN-47, généralisé en MIN-144).
 * Enveloppe AES-256-GCM (lib/server/encryption.ts) : le ciphertext stocké est
 * `JSON.stringify(encrypt(plaintext, secret))`, rangé dans
 * `git_connections.access_token_encrypted` / `refresh_token_encrypted` (OAuth
 * GitLab) et `git_user_identities.*` (token user-to-server GitHub) — colonnes
 * service-role uniquement. Les tokens ne quittent jamais le serveur et ne sont
 * jamais logués en clair.
 *
 * Le secret s'appelle désormais `GIT_TOKEN_ENCRYPTION_SECRET`, avec repli sur
 * `GITLAB_TOKEN_ENCRYPTION_SECRET` : les enveloppes déjà en base ont été
 * scellées avec l'ancien, et la dérivation scrypt part du secret — le renommer
 * sans repli rendrait illisibles toutes les connexions GitLab existantes. Une
 * prod qui ne pose que l'ancien nom continue donc de marcher, sans rien faire.
 *
 * Fail-closed : un secret absent lève (on ne stocke JAMAIS un token en clair) ;
 * le déchiffrement renvoie null (jamais d'exception) pour qu'un secret tourné ou
 * une enveloppe corrompue se traduise par une invite de reconnexion en amont.
 */
function getForgeTokenSecret(): string {
  const secret =
    process.env.GIT_TOKEN_ENCRYPTION_SECRET ||
    process.env.GITLAB_TOKEN_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "Missing GIT_TOKEN_ENCRYPTION_SECRET (or GITLAB_TOKEN_ENCRYPTION_SECRET) for forge token encryption",
    );
  }
  return secret;
}

/** Un secret de chiffrement est-il déployé ? (garde de configuration.) */
export function isForgeTokenCryptoConfigured(): boolean {
  return !!(
    process.env.GIT_TOKEN_ENCRYPTION_SECRET ||
    process.env.GITLAB_TOKEN_ENCRYPTION_SECRET
  );
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

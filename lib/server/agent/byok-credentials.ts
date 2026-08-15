import "server-only";
import { requireSecret } from "@/lib/server/env-secrets";

import { decrypt, encrypt, isEncryptedEnvelope } from "@/lib/server/encryption";

/**
 * Chiffrement au repos des clés « BYOK » OpenRouter que les utilisateurs
 * fournissent (MIN-46 / MIN-10). Même enveloppe AES-256-GCM que les tokens git
 * (lib/server/encryption.ts) mais avec un secret dédié : le ciphertext stocké
 * est `JSON.stringify(encrypt(plain, secret))`, rangé dans
 * user_ai_keys.key_encrypted (service-role uniquement). La clé ne quitte jamais
 * le serveur et n'est jamais loguée en clair.
 *
 * Fail-closed : secret absent → lève au chiffrement (on ne stocke JAMAIS une clé
 * en clair) ; le déchiffrement renvoie null (jamais d'exception) → un secret
 * tourné se traduit par « reconfigure ta clé » en amont plutôt qu'un crash.
 */
function getAiKeySecret(): string {
  // Absent OU trop court : le même refus (MIN-347). Une clé AES dérivée d'un
  // secret de trois caractères ne vaut pas mieux que ces trois caractères.
  return requireSecret("AI_KEY_ENCRYPTION_SECRET");
}

/**
 * État non sensible stocké pour un endpoint local sans authentification. La
 * colonne historique `key_encrypted` est `NOT NULL` dans certaines instances :
 * ce marqueur permet donc d'enregistrer Ollama immédiatement, sans demander de
 * clé ni de migration préalable. Il n'est jamais envoyé au fournisseur.
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

/** Aperçu non-sensible d'une clé pour l'affichage (préfixe + ellipse). */
export function keyPrefix(plain: string): string {
  const trimmed = plain.trim();
  if (trimmed.length <= 12) return `${trimmed.slice(0, 4)}…`;
  return `${trimmed.slice(0, 12)}…`;
}

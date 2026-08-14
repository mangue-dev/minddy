import "server-only";
import { hasStrongSecret, requireSecret } from "@/lib/server/env-secrets";

import { decrypt, encrypt, isEncryptedEnvelope } from "@/lib/server/encryption";

/**
 * Chiffrement au repos du secret SSO d'un board (MIN-119).
 *
 * `feedback_boards.sso_secret` est le secret partagé HS256 avec lequel le
 * backend de l'éditeur signe l'identité de ses utilisateurs. Qui le détient
 * peut forger l'identité de N'IMPORTE QUEL visiteur du board — donc écrire et
 * voter sous l'adresse de quelqu'un d'autre. Il vivait pourtant en clair, seul
 * secret du produit dans ce cas : les tokens de forge et les clés IA « BYOK »
 * portent la même enveloppe AES-256-GCM depuis MIN-47 et MIN-46.
 *
 * Il reste réaffichable au propriétaire, et c'est le point : un secret partagé
 * qu'on ne peut pas relire est un secret qu'on doit faire tourner à chaque perte
 * de post-it. C'est ce besoin — réversible, pas vérifiable — qui appelle un
 * chiffrement plutôt qu'une empreinte.
 *
 * COMPATIBILITÉ. `readBoardSsoSecret` accepte une valeur qui n'est pas une
 * enveloppe : c'est un secret d'avant cette bascule, rendu tel quel. Les
 * lectures de `lib/server/feedback/boards.ts` le rescellent au passage, donc un
 * board actif se met à jour tout seul à sa première visite.
 *
 * Fail-closed à l'écriture (secret d'env absent → lève) : on ne stocke jamais en
 * clair. Le déchiffrement, lui, rend null plutôt que de lever — un secret d'env
 * tourné se traduit par « regénère ton secret SSO » et non par un board en 500.
 */

function getSsoEncryptionSecret(): string {
  // Absent OU trop court : le même refus (MIN-347).
  return requireSecret("FEEDBACK_SSO_ENCRYPTION_SECRET");
}

/** Le secret de chiffrement est-il déployé, et utilisable ? (garde de config.) */
export function isSsoCryptoConfigured(): boolean {
  return hasStrongSecret("FEEDBACK_SSO_ENCRYPTION_SECRET");
}

export function encryptBoardSsoSecret(plain: string): string {
  return JSON.stringify(encrypt(plain, getSsoEncryptionSecret()));
}

export interface BoardSsoSecretRead {
  /** Le secret utilisable, ou null s'il est illisible. */
  plain: string | null;
  /** Vrai quand la valeur stockée était en clair (secret d'avant MIN-119). */
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
    // Pas du JSON : c'est un `fbsso_…` d'avant le chiffrement.
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

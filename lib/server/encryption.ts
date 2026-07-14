import "server-only";

import crypto from "node:crypto";

/**
 * Chiffrement au repos (AES-256-GCM) — porté de l'enveloppe d'AutoKap
 * (src/capture-encryption.ts). Utilisé pour stocker les tokens OAuth GitLab
 * (git_connections.access_token_encrypted / refresh_token_encrypted) que le
 * modèle GitHub App n'a pas besoin de stocker (tokens mintés à la volée).
 *
 * L'enveloppe est auto-descriptive et sérialisée en JSON dans une colonne text.
 * La clé est dérivée par scrypt à partir d'un secret d'env + un sel aléatoire
 * par message ; IV et tag GCM aléatoires. Aucune dépendance externe (node:crypto).
 */
export interface EncryptedEnvelope {
  __encrypted: true;
  version: 2;
  iv: string;
  tag: string;
  ciphertext: string;
  salt: string;
}

function deriveKey(secret: string, salt: Buffer): Buffer {
  return crypto.scryptSync(secret, salt, 32, {
    N: 1 << 15,
    r: 8,
    p: 1,
    maxmem: 128 * 1024 * 1024,
  });
}

export function encrypt(plaintext: string, secret: string): EncryptedEnvelope {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(secret, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    __encrypted: true,
    version: 2,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    salt: salt.toString("base64"),
  };
}

export function decrypt(envelope: EncryptedEnvelope, secret: string): string {
  const key = deriveKey(secret, Buffer.from(envelope.salt, "base64"));
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    c.__encrypted === true &&
    c.version === 2 &&
    typeof c.iv === "string" &&
    typeof c.tag === "string" &&
    typeof c.ciphertext === "string" &&
    typeof c.salt === "string"
  );
}

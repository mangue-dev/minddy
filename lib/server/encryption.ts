import "server-only";

import crypto from "node:crypto";

/**
 * Encryption at rest (AES-256-GCM) — carried from the AutoKap
 * wrapper (src/capture-encryption.ts). Used to store OAuth GitLab
 * tokens (git_connections.access_token_encrypted / refresh_token_encrypted) that the
 * GitHub App model does not need to store (minted tokens on the fly).
 *
 * The wrapper is self-describing and serialized to JSON in a text column.
 * The key is derived by scrypt from a secret of env + a random salt
 * per message; Random IV and GCM tag. No external dependencies (node:crypto).
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

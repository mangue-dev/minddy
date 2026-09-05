import "server-only";
import { encrypt, decrypt, isEncryptedEnvelope } from "./encryption";
import { requireSecret } from "./env-secrets";

export function encryptMcpToken(token: string): string | null {
  return token
    ? JSON.stringify(encrypt(token, requireSecret("AI_KEY_ENCRYPTION_SECRET")))
    : null;
}

export function decryptMcpToken(value: string | null): string | null {
  if (!value) return null;
  const envelope: unknown = JSON.parse(value);
  if (!isEncryptedEnvelope(envelope)) throw new Error("Invalid MCP credential");
  return decrypt(envelope, requireSecret("AI_KEY_ENCRYPTION_SECRET"));
}

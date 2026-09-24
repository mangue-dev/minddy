import "server-only";

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { attachmentObjectScope } from "./attachment-object-content";
import { getContentKeys } from "./registry";

function signature(key: Buffer, path: string, expires: number,
  disposition: string): string {
  const signingKey = Buffer.from(hkdfSync("sha256", key,
    Buffer.from("minddy-attachment-url-salt-v1"),
    Buffer.from("minddy-attachment-url-signing-v1"), 32));
  try {
    return createHmac("sha256", signingKey)
    .update(JSON.stringify(["minddy-attachment-url-v1", path, expires, disposition]))
    .digest("base64url");
  } finally { signingKey.fill(0); }
}

/** Issue a short-lived capability only after the caller has authorized a file. */
export async function signAttachmentRead(path: string, expiresIn: number,
  disposition: string): Promise<{ expires: number; version: number; sig: string }> {
  if (!Number.isSafeInteger(expiresIn) || expiresIn < 1 || expiresIn > 86_400) {
    throw new Error("Invalid attachment URL lifetime");
  }
  const key = await getContentKeys().current(attachmentObjectScope(path));
  try {
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    return { expires, version: key.version,
      sig: signature(key.bytes, path, expires, disposition) };
  } finally { key.bytes.fill(0); }
}

/** Validate a capability before decrypting any object bytes. */
export async function verifyAttachmentRead(path: string, expires: string,
  version: string, disposition: string, sig: string): Promise<boolean> {
  const deadline = Number(expires), keyVersion = Number(version);
  if (!Number.isSafeInteger(deadline) || deadline < Math.floor(Date.now() / 1000) ||
      !Number.isSafeInteger(keyVersion) || keyVersion < 1 ||
      !/^[A-Za-z0-9_-]{43}$/.test(sig)) return false;
  try {
    const key = await getContentKeys().byVersion(attachmentObjectScope(path), keyVersion);
    if (!key) return false;
    try {
      const expected = signature(key.bytes, path, deadline, disposition);
      return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } finally { key.bytes.fill(0); }
  } catch { return false; }
}

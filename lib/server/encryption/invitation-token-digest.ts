import "server-only";

import { createHash, randomBytes } from "node:crypto";

/** A database-only leak must not provide a usable invitation preview token. */
export function digestInvitationToken(token: string): string {
  return `sha256:${createHash("sha256").update(token, "utf8").digest("hex")}`;
}

export function createInvitationToken(): { raw: string; digest: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, digest: digestInvitationToken(raw) };
}

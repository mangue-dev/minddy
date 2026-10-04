import "server-only";

import type { EncryptionContext } from "./store";

export type DecryptAudit = {
  actorId: string | null;
  reason: "invitation_preview" | "invitation_response" | "invitation_list" | "assistant_member_list"
    | "repository_read" | "migration_verification" | "key_rotation";
};

export function auditDecryption(_context: EncryptionContext, _audit: DecryptAudit): void {
  // Successful decryptions are intentionally silent to avoid flooding request logs.
}

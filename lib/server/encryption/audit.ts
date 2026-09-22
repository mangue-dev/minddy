import "server-only";

import type { EncryptionContext } from "./store";

export type DecryptAudit = {
  actorId: string | null;
  reason: "invitation_preview" | "invitation_response" | "invitation_list" | "assistant_member_list";
};

/** No plaintext, key material, ciphertext, or search input enters this event. */
export function auditDecryption(context: EncryptionContext, audit: DecryptAudit): void {
  console.info("[data-decrypt]", {
    actor_id: audit.actorId,
    reason: audit.reason,
    scope_kind: context.scope.kind,
    scope_id: context.scope.id,
    table: context.table,
    column: context.column,
    row_id: context.rowId,
  });
}

import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

import {
  decryptInvitationEmail,
  encryptInvitationEmail,
  isInvitationEncryptionConfigured,
  isInvitationEncryptionEnabled,
} from "./invitation-email";
import { digestInvitationToken } from "./invitation-token-digest";

export type InvitationBackfillResult = {
  scanned: number;
  encrypted: number;
  rotated: number;
  purged: number;
  conflicted: number;
  failed: number;
};

/** One bounded, fair pass over legacy and historical invitation emails. */
export async function backfillInvitationEmailsBatch(
  limit = 100,
): Promise<InvitationBackfillResult> {
  if (!isInvitationEncryptionEnabled() || !isInvitationEncryptionConfigured()) {
    throw new Error("Invitation encryption is not enabled and configured");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("Invalid invitation backfill batch size");
  }

  const service = getServiceClient();
  const { data, error } = await service.rpc("list_invitation_email_rotation_candidates",
    { p_limit: limit });
  if (error) throw new Error(`Unable to load invitation backfill: ${error.code}`);

  const result: InvitationBackfillResult = {
    scanned: data?.length ?? 0,
    encrypted: 0,
    rotated: 0,
    purged: 0,
    conflicted: 0,
    failed: 0,
  };
  for (const row of data ?? []) {
    try {
      const legacy = row.encryption_version === 0;
      if (row.status !== "pending" || Date.parse(row.expires_at as string) <= Date.now()) {
        const table = service.from("project_invitations");
        // Expired pending rows must not become cancelled rows that retention never deletes.
        const purge = row.status === "pending"
          ? table.delete()
          : table.update({
            invited_email: null,
            invited_email_ciphertext: null,
            invited_email_blind_index: null,
            token: legacy ? digestInvitationToken(row.token as string) : row.token,
          });
        let query = purge
          .eq("id", row.id)
          .eq("status", row.status)
          .eq("encryption_version", row.encryption_version)
          .eq("token", row.token);
        if (legacy) query = query.eq("invited_email", row.invited_email);
        else query = query.eq("invited_email_ciphertext", row.invited_email_ciphertext)
          .eq("invited_email_blind_index", row.invited_email_blind_index);
        const { data: purged, error: purgeError } = await query.select("id");
        if (purgeError) throw new Error(`Unable to purge invitation email: ${purgeError.code}`);
        result.purged += purged?.length ?? 0;
        if (!purged?.length) result.conflicted++;
      } else {
        const email = legacy ? row.invited_email : await decryptInvitationEmail(row,
          { actorId: null, reason: "key_rotation" });
        if (typeof email !== "string") throw new Error("Invalid invitation email candidate");
        const encrypted = await encryptInvitationEmail(email,
          row.project_id as string, row.id as string);
        let query = service.from("project_invitations")
          .update({ invited_email: null,
            token: legacy ? digestInvitationToken(row.token as string) : row.token,
            ...encrypted })
          .eq("id", row.id)
          .eq("encryption_version", row.encryption_version)
          .eq("token", row.token)
          .eq("status", "pending")
          .gt("expires_at", new Date().toISOString());
        if (legacy) query = query.eq("invited_email", row.invited_email);
        else query = query.eq("invited_email_ciphertext", row.invited_email_ciphertext)
          .eq("invited_email_blind_index", row.invited_email_blind_index);
        const { data: migrated, error: updateError } = await query.select("id");
        if (updateError) throw new Error(`Unable to encrypt invitation email: ${updateError.code}`);
        if (migrated?.length) result[legacy ? "encrypted" : "rotated"] += migrated.length;
        else result.conflicted++;
      }
    } catch {
      result.failed++;
    }
    const recorded = await service.rpc("record_invitation_email_rotation_attempt",
      { p_id: row.id });
    if (recorded.error) throw new Error("Unable to advance invitation rotation queue");
  }
  const activation = await service.rpc("activate_invitation_email");
  if (activation.error) throw new Error("Unable to verify invitation encryption activation");
  return result;
}

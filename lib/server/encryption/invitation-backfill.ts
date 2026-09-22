import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

import {
  encryptInvitationEmail,
  isInvitationEncryptionConfigured,
  isInvitationEncryptionEnabled,
} from "./invitation-email";
import { digestInvitationToken } from "./invitation-token-digest";

export type InvitationBackfillResult = {
  scanned: number;
  encrypted: number;
  purged: number;
};

/** One bounded, restartable pass over legacy invitation emails. */
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
  const { data, error } = await service
    .from("project_invitations")
    .select("id,project_id,invited_email,status,expires_at,token")
    .eq("encryption_version", 0)
    .not("invited_email", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Unable to load invitation backfill: ${error.code}`);

  const result: InvitationBackfillResult = {
    scanned: data?.length ?? 0,
    encrypted: 0,
    purged: 0,
  };
  for (const row of data ?? []) {
    if (typeof row.invited_email !== "string") {
      // Terminal rows may already have had their email purged.
      continue;
    }
    if (row.status !== "pending" || Date.parse(row.expires_at as string) <= Date.now()) {
      const { data: purged, error: purgeError } = await service
        .from("project_invitations")
        .update({
          status: row.status === "pending" ? "cancelled" : row.status,
          invited_email: null,
          invited_email_ciphertext: null,
          invited_email_blind_index: null,
          token: digestInvitationToken(row.token as string),
        })
        .eq("id", row.id)
        .eq("encryption_version", 0)
        .eq("invited_email", row.invited_email)
        .eq("token", row.token)
        .select("id");
      if (purgeError) throw new Error(`Unable to purge invitation email: ${purgeError.code}`);
      result.purged += purged?.length ?? 0;
      continue;
    }

    const encrypted = await encryptInvitationEmail(
      row.invited_email,
      row.project_id as string,
      row.id as string,
    );
    const { data: migrated, error: updateError } = await service
      .from("project_invitations")
      .update({ invited_email: null, token: digestInvitationToken(row.token as string), ...encrypted })
      .eq("id", row.id)
      .eq("encryption_version", 0)
      .eq("invited_email", row.invited_email)
      .eq("token", row.token)
      .eq("status", "pending")
      .select("id");
    if (updateError) throw new Error(`Unable to encrypt invitation email: ${updateError.code}`);
    result.encrypted += migrated?.length ?? 0;
  }
  return result;
}

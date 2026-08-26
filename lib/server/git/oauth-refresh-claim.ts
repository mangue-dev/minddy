import "server-only";

import { randomUUID } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";

export type ForgeOAuthRefreshKind = "connection" | "identity";

/**
 * Claims a rotating OAuth grant before contacting the provider. A null result
 * means another application instance owns the current lineage.
 */
export async function claimForgeOAuthRefresh(params: {
  kind: ForgeOAuthRefreshKind;
  rowId: string;
  expectedExpiresAt: string | null;
  expectedRefreshTokenEncrypted: string | null;
}): Promise<string | null> {
  const claimId = randomUUID();
  const { data, error } = await getServiceClient().rpc("claim_forge_oauth_refresh", {
    p_kind: params.kind,
    p_row_id: params.rowId,
    p_expected_expires_at: params.expectedExpiresAt,
    p_expected_refresh_token_encrypted: params.expectedRefreshTokenEncrypted,
    p_claim_id: claimId,
  });
  if (error) throw new Error(`OAuth refresh claim failed: ${error.message}`);
  return data === true ? claimId : null;
}

/** Releases only the caller's claim, leaving a replacement worker untouched. */
export async function releaseForgeOAuthRefreshClaim(
  kind: ForgeOAuthRefreshKind,
  rowId: string,
  claimId: string,
): Promise<void> {
  const table = kind === "connection" ? "git_connections" : "git_user_identities";
  const { error } = await getServiceClient()
    .from(table)
    .update({ oauth_refresh_claim: null, oauth_refresh_claimed_at: null })
    .eq("id", rowId)
    .eq("oauth_refresh_claim", claimId);
  if (error) {
    console.error("[forge-oauth] refresh claim release failed:", error.message);
  }
}

export const waitForForgeOAuthRefresh = (milliseconds = 100): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

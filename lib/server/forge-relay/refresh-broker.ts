import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import {
  hashRefreshToken,
  refreshGitlabTokensWithManagedApp,
  refreshGithubUserTokensWithManagedApp,
  type BrokeredTokenSet,
} from "./oauth-refresh";

/**
 * Lineage-checked OAuth token refresh for relayed instances, Cloud side
 * (docs/managed-forge-relay-plan.md).
 *
 * A refresh grant run on behalf of an instance must never become an oracle:
 * Cloud only refreshes tokens whose lineage traces to a delivery it handed to
 * THIS instance. `forge_relay_refresh_lineage` stores the SHA-256 of the last
 * refresh token delivered per (instance, provider, account); every brokered
 * rotation advances the hash. A presented token that matches no row is
 * refused (fail-closed) and audited — a compromised instance secret cannot
 * keep foreign tokens alive.
 */

export type RefreshProvider = "github" | "gitlab";

export type RefreshBrokerResult =
  | { ok: true; tokens: BrokeredTokenSet }
  | { ok: false; status: number; error: string };

/** Append-only trace of a relay action. Best-effort: the action already happened. */
async function recordRelayAudit(
  instanceId: string,
  action: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await getServiceClient()
      .from("forge_relay_audit")
      .insert({ instance_id: instanceId, action, detail });
    if (error) throw error;
  } catch (err) {
    console.error("[forge-relay] audit write failed:", (err as Error).message);
  }
}

export async function brokerTokenRefresh(input: {
  instanceId: string;
  provider: RefreshProvider;
  refreshToken: string;
}): Promise<RefreshBrokerResult> {
  const { instanceId, provider } = input;
  const presentedHash = hashRefreshToken(input.refreshToken);

  const supabase = getServiceClient();
  const { data } = await supabase
    .from("forge_relay_refresh_lineage")
    .select("id")
    .eq("instance_id", instanceId)
    .eq("provider", provider)
    .eq("refresh_token_hash", presentedHash)
    .limit(1)
    .maybeSingle();
  const lineage = data as { id: string } | null;
  if (!lineage) {
    await recordRelayAudit(instanceId, "token_refresh_refused", {
      provider,
      reason: "unknown_refresh_token",
    });
    return {
      ok: false,
      status: 403,
      error: "This refresh token was not issued to this instance",
    };
  }

  let tokens: BrokeredTokenSet;
  try {
    tokens =
      provider === "gitlab"
        ? await refreshGitlabTokensWithManagedApp(input.refreshToken)
        : await refreshGithubUserTokensWithManagedApp(input.refreshToken);
  } catch (err) {
    // Includes the single-use rotation race: the instance's own recovery path
    // re-reads its stored row, where the winning worker persisted the fresh set.
    await recordRelayAudit(instanceId, "token_refresh_failed", {
      provider,
      error: (err as Error).message,
    });
    return { ok: false, status: 502, error: (err as Error).message };
  }

  if (tokens.refreshToken) {
    // Advance the lineage to the rotated token. On the concurrent-rotation
    // race the unique constraint rejects the loser's write — correct outcome:
    // the winner's hash is the only live one.
    const { error: updateError } = await supabase
      .from("forge_relay_refresh_lineage")
      .update({
        refresh_token_hash: hashRefreshToken(tokens.refreshToken),
        updated_at: new Date().toISOString(),
      })
      .eq("id", lineage.id);
    if (updateError) {
      console.warn(
        "[forge-relay] refresh lineage update rejected (concurrent rotation?):",
        updateError.message ?? String(updateError),
      );
    }
  }

  await recordRelayAudit(instanceId, "token_refresh", { provider });
  return { ok: true, tokens };
}

/**
 * Records the lineage of a token pair at delivery time — the entry that makes
 * every later refresh of that pair refreshable by its instance. Replaces any
 * previous lineage for the same account.
 */
export async function recordRefreshLineage(input: {
  instanceId: string;
  provider: RefreshProvider;
  providerAccountId: string;
  refreshToken: string | null;
}): Promise<void> {
  if (!input.refreshToken) return;
  const supabase = getServiceClient();
  await supabase
    .from("forge_relay_refresh_lineage")
    .delete()
    .eq("instance_id", input.instanceId)
    .eq("provider", input.provider)
    .eq("provider_account_id", input.providerAccountId);
  await supabase.from("forge_relay_refresh_lineage").insert({
    instance_id: input.instanceId,
    provider: input.provider,
    provider_account_id: input.providerAccountId,
    refresh_token_hash: hashRefreshToken(input.refreshToken),
  });
}

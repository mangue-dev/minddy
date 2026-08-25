import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { normalizeRelayPublicKey } from "./protocol";

/**
 * Instance registry for the managed forge relay control plane
 * (docs/managed-forge-relay-plan.md, "Instance identity and authentication").
 *
 * Registration happens through the operator's minddy Cloud account: the
 * operator names the instance and submits the Ed25519 PUBLIC key generated
 * instance-side. Revocation is unilateral and immediate: a revoked instance
 * fails signature verification on every subsequent relay request, which kills
 * token minting and (once the fan-out lands) webhook delivery in one move.
 */

export interface RelayInstanceRecord {
  id: string;
  name: string;
  status: string;
  created_at: string;
  revoked_at: string | null;
}

export type RegistrationResult =
  | { ok: true; instance: RelayInstanceRecord }
  | { ok: false; error: string };

export async function registerRelayInstance(input: {
  name: string;
  publicKey: string;
}): Promise<RegistrationResult> {
  const name = input.name.trim();
  if (!name || name.length > 100) {
    return { ok: false, error: "Instance name is required (max 100 characters)" };
  }
  let publicKey: string;
  try {
    publicKey = normalizeRelayPublicKey(input.publicKey);
  } catch (err) {
    return { ok: false, error: `Invalid public key: ${(err as Error).message}` };
  }

  const { data, error } = await getServiceClient()
    .from("forge_relay_instances")
    .insert({ name, public_key: publicKey })
    .select("id, name, status, created_at, revoked_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "This public key is already registered" };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, instance: data as RelayInstanceRecord };
}

export async function listRelayInstances(): Promise<RelayInstanceRecord[]> {
  const { data } = await getServiceClient()
    .from("forge_relay_instances")
    .select("id, name, status, created_at, revoked_at")
    .order("created_at", { ascending: false });
  return (data ?? []) as RelayInstanceRecord[];
}

export type RevocationResult =
  | { ok: true; instance: RelayInstanceRecord }
  | { ok: false; status: number; error: string };

export async function revokeRelayInstance(instanceId: string): Promise<RevocationResult> {
  const supabase = getServiceClient();
  const revokedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("forge_relay_instances")
    .update({
      status: "revoked",
      revoked_at: revokedAt,
      webhook_url: null,
      webhook_secret_encrypted: null,
    })
    .eq("id", instanceId)
    .eq("status", "active")
    .select("id, name, status, created_at, revoked_at")
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };

  let instance = data as RelayInstanceRecord | null;
  if (!instance) {
    // Revocation is idempotent so a retry can finish queue invalidation after
    // the instance update succeeded but the delivery update failed.
    const { data: existing, error: lookupError } = await supabase
      .from("forge_relay_instances")
      .select("id, name, status, created_at, revoked_at")
      .eq("id", instanceId)
      .eq("status", "revoked")
      .maybeSingle();
    if (lookupError) return { ok: false, status: 500, error: lookupError.message };
    instance = existing as RelayInstanceRecord | null;
  }
  if (!instance) return { ok: false, status: 404, error: "Relay instance not found" };

  const { error: deliveriesError } = await supabase
    .from("forge_relay_deliveries")
    .update({ status: "dead", last_error: "relay instance revoked" })
    .eq("instance_id", instanceId)
    .eq("status", "pending");
  if (deliveriesError) {
    return { ok: false, status: 500, error: deliveriesError.message };
  }
  return { ok: true, instance };
}

import "server-only";

import { randomUUID } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import { normalizeRelayPublicKey } from "./protocol";
import { decodeRelayInstance, encodeRelayInstance,
  shouldProtectRelayInstance, type RelayInstanceContentRow } from
  "./instance-content";

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

async function publicInstance(row: RelayInstanceContentRow):
  Promise<RelayInstanceRecord> {
  const plain = Number(row.encryption_version ?? 0) > 0
    ? await decodeRelayInstance(row) : row;
  if (typeof plain.name !== "string") {
    throw new Error("Invalid relay instance label");
  }
  return { id: plain.id, name: plain.name!, status: plain.status as string,
    created_at: plain.created_at as string,
    revoked_at: plain.revoked_at as string | null };
}

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

  const service = getServiceClient();
  const encoded = await encodeRelayInstance({ id: randomUUID(), name,
    webhook_url: null, webhook_secret_encrypted: null }, { service });
  const { data, error } = await service
    .from("forge_relay_instances")
    .insert({ id: encoded.id, name: encoded.name, public_key: publicKey,
      webhook_url: null, webhook_secret_encrypted: null,
      encrypted_content: encoded.encrypted_content ?? null,
      encryption_version: encoded.encryption_version ?? 0 })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "This public key is already registered" };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, instance: await publicInstance(data as RelayInstanceContentRow) };
}

export async function listRelayInstances(): Promise<RelayInstanceRecord[]> {
  const { data } = await getServiceClient()
    .from("forge_relay_instances")
    .select("*")
    .order("created_at", { ascending: false });
  return Promise.all(((data ?? []) as RelayInstanceContentRow[]).map(publicInstance));
}

export type RevocationResult =
  | { ok: true; instance: RelayInstanceRecord }
  | { ok: false; status: number; error: string };

export async function revokeRelayInstance(instanceId: string): Promise<RevocationResult> {
  const supabase = getServiceClient();
  const revokedAt = new Date().toISOString();
  let instance: RelayInstanceRecord | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: current, error: readError } = await supabase
      .from("forge_relay_instances").select("*")
      .eq("id", instanceId).maybeSingle();
    if (readError) return { ok: false, status: 500, error: readError.message };
    if (!current || current.status !== "active") break;
    const row = current as RelayInstanceContentRow;
    const protect = Number(row.encryption_version ?? 0) > 0 ||
      await shouldProtectRelayInstance(supabase);
    const plain = protect ? await decodeRelayInstance(row) : row;
    const encoded = protect ? await encodeRelayInstance({ ...plain,
      webhook_url: null, webhook_secret_encrypted: null },
    { service: supabase, force: true }) : null;
    let query = supabase.from("forge_relay_instances").update({
      status: "revoked", revoked_at: revokedAt,
      webhook_url: null, webhook_secret_encrypted: null,
      ...(encoded ? { name: null,
        encrypted_content: encoded.encrypted_content,
        encryption_version: encoded.encryption_version } : {}),
    }).eq("id", instanceId).eq("status", "active");
    if ("content_revision" in row) {
      query = query.eq("content_revision", row.content_revision ?? 0);
    }
    const { data, error } = await query.select("*").maybeSingle();
    if (error) return { ok: false, status: 500, error: error.message };
    if (data) { instance = await publicInstance(data as RelayInstanceContentRow); break; }
  }
  if (!instance) {
    // Revocation is idempotent so a retry can finish queue invalidation after
    // the instance update succeeded but the delivery update failed.
    const { data: existing, error: lookupError } = await supabase
      .from("forge_relay_instances")
      .select("*")
      .eq("id", instanceId)
      .eq("status", "revoked")
      .maybeSingle();
    if (lookupError) return { ok: false, status: 500, error: lookupError.message };
    instance = existing ? await publicInstance(existing as RelayInstanceContentRow) : null;
  }
  if (!instance) return { ok: false, status: 404, error: "Relay instance not found" };

  const { error: deliveriesError } = await supabase
    .from("forge_relay_deliveries")
    .update({ status: "dead", last_error: null })
    .eq("instance_id", instanceId)
    .eq("status", "pending");
  if (deliveriesError) {
    return { ok: false, status: 500, error: deliveriesError.message };
  }
  return { ok: true, instance };
}

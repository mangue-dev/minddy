import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { DEFAULT_AGENT_BRANCH_PREFIX, normalizeAgentBranchPrefix } from "./branch-name";

const marker = "mdye3:";
type Row = { user_id: string; branch_prefix: string; [key: string]: unknown };

function binding(userId: string) {
  if (!userId) throw new Error("Agent branch prefix owner is required");
  return { scope: { kind: "user" as const, id: userId },
    table: "user_agent_preferences", column: "branch_prefix",
    rowId: userId };
}

export async function shouldProtectAgentBranchPrefix(
  service: SupabaseClient = getServiceClient(),
): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_AGENT_BRANCH_PREFIX_ENCRYPTION_ENABLED === "true") return true;
  const { data, error } = await service.from("agent_branch_prefix_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code))
    throw new Error("Unable to resolve agent branch prefix protection state");
  return !!data;
}

export async function encodeAgentBranchPrefix(userId: string, value: string) {
  const normalized = normalizeAgentBranchPrefix(value);
  if (!normalized || normalized !== value)
    throw new Error("Invalid agent branch prefix");
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, binding(userId));
  return `${marker}${cipher}`;
}

export async function decodeAgentBranchPrefix(userId: string, value: string | null) {
  if (!value) return DEFAULT_AGENT_BRANCH_PREFIX;
  if (!value.startsWith(marker)) {
    const normalized = normalizeAgentBranchPrefix(value);
    if (!normalized) throw new Error("Invalid legacy agent branch prefix");
    return normalized;
  }
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(value.slice(marker.length));
  if (store.formatOf(cipher) !== 3) throw new Error("Invalid agent branch prefix envelope");
  const decoded = await store.decrypt(cipher, binding(userId));
  if (normalizeAgentBranchPrefix(decoded) !== decoded)
    throw new Error("Invalid protected agent branch prefix");
  return decoded;
}

export function agentBranchPrefixVersion(value: string) {
  if (!value.startsWith(marker)) return 0;
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(value.slice(marker.length));
  if (store.formatOf(cipher) !== 3) throw new Error("Invalid agent branch prefix envelope");
  return store.versionOf(cipher);
}

/** The protected RPC merges partial preference changes under one row lock. */
export async function saveAgentPreferences(
  userId: string, patch: Record<string, unknown>,
  client: SupabaseClient = getServiceClient(),
): Promise<Row> {
  if (Object.keys(patch).some((key) => ![
    "branch_prefix", "default_model", "default_model_provider",
    "default_reasoning_level", "sandbox_region", "sandbox_size",
  ].includes(key))) throw new Error("Unsupported agent preference field");
  const service = getServiceClient();
  if (!await shouldProtectAgentBranchPrefix(service)) {
    const { error } = await client.from("user_agent_preferences")
      .upsert({ user_id: userId, updated_at: new Date().toISOString(), ...patch },
        { onConflict: "user_id" });
    if (error) throw new Error("Unable to save agent preferences");
    const read = await client.from("user_agent_preferences").select("*")
      .eq("user_id",userId).maybeSingle();
    if (read.error || !read.data) throw new Error("Unable to load agent preferences");
    return read.data as Row;
  }
  const replace = Object.hasOwn(patch, "branch_prefix");
  const value = replace ? patch.branch_prefix : DEFAULT_AGENT_BRANCH_PREFIX;
  if (typeof value !== "string") throw new Error("Invalid agent branch prefix");
  const cipher = await encodeAgentBranchPrefix(userId, value);
  const { branch_prefix: _branch, ...metadata } = patch;
  const { data, error } = await service.rpc("upsert_agent_preferences_protected", {
    p_user_id: userId, p_values: metadata, p_branch_cipher: cipher,
    p_replace_branch: replace,
  }).single();
  if (error || !data) throw new Error("Unable to save protected agent preferences");
  return data as Row;
}

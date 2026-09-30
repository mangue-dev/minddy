import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./content-config";
import { getBlindIndexKeys } from "./registry";
import { blindIndex, type EncryptionScope } from "./store";

const SCOPE: EncryptionScope = { kind: "system",
  id: "00000000-0000-0000-0000-000000000000" };
const CONTEXT = { scope: SCOPE, table: "forge_mention_throttle", column: "key" };

export async function shouldIndexForgeMentionKey(
  service: SupabaseClient = getServiceClient()): Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  const { data, error } = await service.from("forge_mention_key_encryption_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve forge mention key protection state");
  }
  return !!data;
}

/** Keep the purpose-separated equality key at version one across data-key rotation. */
export async function forgeMentionKeyIndex(key: string): Promise<string> {
  if (!key || key.startsWith("mdyf1:")) throw new Error("Invalid mention key");
  const registry = getBlindIndexKeys();
  const initial = await registry.current(SCOPE);
  initial.bytes.fill(0);
  const stable = await registry.byVersion(SCOPE, 1);
  try {
    return `mdyf1:${blindIndex(key, CONTEXT, stable.bytes)}`;
  } finally {
    stable.bytes.fill(0);
  }
}

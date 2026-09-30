import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { appConfigEncryptionEnabled, decodeAppConfig, encodeAppConfig, type AppConfigRow } from
  "@/lib/server/encryption/app-config-content";

// In-process TTL cache to avoid a DB hit on every assistant request.
// Each Next.js worker process has its own cache; changes propagate within 60s.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: string; expiresAt: number }>();

export async function getAppConfigValue(key: string): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("app_config")
    .select("key,value,encryption_version,encrypted_content")
    .eq("key", key)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw new Error("Unable to read app configuration");
  }

  const value = data ? await decodeAppConfig(data as AppConfigRow) : null;
  if (value !== null) {
    cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  }
  return value;
}

/** Fetch multiple keys in a single DB query. Cache-aware. */
export async function getAppConfigValues(
  keys: string[]
): Promise<Record<string, string | null>> {
  const now = Date.now();
  const result: Record<string, string | null> = {};
  const missing: string[] = [];

  for (const key of keys) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
      result[key] = cached.value;
    } else {
      result[key] = null;
      missing.push(key);
    }
  }

  if (missing.length === 0) return result;

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("app_config")
    .select("key,value,encryption_version,encrypted_content")
    .in("key", missing);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return result;
    throw new Error("Unable to read app configuration");
  }
  for (const row of data ?? []) {
    const value = await decodeAppConfig(row as AppConfigRow);
    result[row.key] = value;
    cache.set(row.key, { value, expiresAt: now + CACHE_TTL_MS });
  }

  return result;
}

/**
 * Resets a key to its PRODUCT default by deleting its line: the reading
 * then falls back to the `fallback` of the register (`lib/ai-model-config.ts`), which
 * will track future default changes. Writing the default id instead
 * would freeze the setting at today's value.
 */
export async function clearAppConfigValue(key: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.from("app_config").delete().eq("key", key);
  if (error) {
    throw new Error(`Failed to clear app_config[${key}]: ${error.message}`);
  }
  cache.delete(key); // invalidate immediately
}

export async function setAppConfigValue(key: string, value: string): Promise<void> {
  const supabase = getServiceClient();
  const { data: previous, error: readError } = await supabase.from("app_config")
    .select("encryption_version").eq("key", key).maybeSingle();
  if (readError) throw new Error("Unable to read app configuration");
  let required = (previous?.encryption_version ?? 0) > 0;
  if (!required && !appConfigEncryptionEnabled()) {
    const marker = await supabase.from("app_config_encryption_scope")
      .select("id").eq("id", true).maybeSingle();
    if (marker.error && marker.error.code !== "42P01" &&
        marker.error.code !== "PGRST205") {
      throw new Error("Unable to check app configuration encryption state");
    }
    required = !!marker.data;
  }
  const encoded = await encodeAppConfig(key, value,
    required ? 1 : previous?.encryption_version ?? 0);
  const { error } = await supabase
    .from("app_config")
    .upsert({ ...encoded, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) {
    throw new Error(`Failed to save app_config[${key}]: ${error.message}`);
  }
  cache.delete(key); // invalidate immediately
}

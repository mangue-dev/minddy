import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

// In-process TTL cache to avoid a DB hit on every assistant request.
// Each Next.js worker process has its own cache; changes propagate within 60s.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: string; expiresAt: number }>();

export async function getAppConfigValue(key: string): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const supabase = getServiceClient();
    const { data } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", key)
      .single();

    const value = data?.value ?? null;
    if (value !== null) {
      cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
    }
    return value;
  } catch {
    // Table may not exist yet (migration not applied) — fall back to null
    return null;
  }
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

  try {
    const supabase = getServiceClient();
    const { data } = await supabase
      .from("app_config")
      .select("key, value")
      .in("key", missing);

    for (const row of data ?? []) {
      result[row.key] = row.value;
      cache.set(row.key, { value: row.value, expiresAt: now + CACHE_TTL_MS });
    }
  } catch {
    // Table may not exist yet — leave missing keys as null
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
  const { error } = await supabase
    .from("app_config")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) {
    throw new Error(`Failed to save app_config[${key}]: ${error.message}`);
  }
  cache.delete(key); // invalidate immediately
}

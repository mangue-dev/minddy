import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Live user resolution from Supabase Auth (auth.users) via the admin API — the
 * single source of truth for names/emails. No `profiles` mirror table: the
 * display name is read straight from the account's auth metadata, so it always
 * reflects what Supabase Auth shows.
 *
 * Server-only (uses the service-role client). Feed the returned
 * `{ email, full_name }` shape to `displayName()` from lib/display-name.ts.
 */

/** First non-empty string among the given metadata keys, else null. */
function pickString(meta: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Map an auth user to minddy's { email, full_name } display shape.
    Name: display_name → full_name → name.

    No avatar here on purpose: the picture is no longer an account field. Every
    account carries a generated mark, whose seed lives in its own table — see
    lib/server/avatar-seeds.ts. */
export function toNamed(
  user: User | null | undefined
): { email: string | null; full_name: string | null } {
  if (!user) return { email: null, full_name: null };
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    email: user.email ?? null,
    full_name: pickString(meta, ["display_name", "full_name", "name"]),
  };
}

// Identity cache (id → account) shared at the module level. Each
// `getUserById` is a round trip to the GoTrue admin API, and the same
// members are resolved on EACH loading of board / poll of notifications
// (me/board, notifications, members, invitations) — an N+1 recurring network.
// A short TTL is enough: names/avatars/emails rarely move, and Fluid Compute
// reuses the instance so the cache stays hot between requests. The 1st view
// pays for round trips; the following ones read the cache.
const IDENTITY_TTL_MS = 60_000;
const identityCache = new Map<string, { user: User; expires: number }>();

/**
 * Resolve auth users by id (best-effort; missing ids are skipped), served from
 * a short TTL memory cache. Only missing or expired ids affect the API
 * admin, and in parallel — instead of a round-trip per id on each call.
 */
export async function fetchAuthUsersById(
  service: SupabaseClient,
  ids: string[]
): Promise<Map<string, User>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();

  const now = Date.now();
  const result = new Map<string, User>();
  const misses: string[] = [];
  for (const id of unique) {
    const hit = identityCache.get(id);
    if (hit && hit.expires > now) {
      result.set(id, hit.user);
    } else {
      misses.push(id);
    }
  }

  if (misses.length > 0) {
    const fetched = await Promise.all(
      misses.map(async (id) => {
        const { data, error } = await service.auth.admin.getUserById(id);
        return error ? null : data.user;
      })
    );
    for (const user of fetched) {
      if (!user) continue;
      identityCache.set(user.id, { user, expires: now + IDENTITY_TTL_MS });
      result.set(user.id, user);
    }
  }

  // Opportunistic pruning of stale entries to limit the cache size.
  if (identityCache.size > 2_000) {
    for (const [id, entry] of identityCache) {
      if (entry.expires <= now) identityCache.delete(id);
    }
  }

  return result;
}

/** Find an account by email via the admin API (pages through auth.users). */
export async function findAuthUserByEmail(
  service: SupabaseClient,
  email: string
): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  const maxPages = 50;
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find((u) => u.email?.toLowerCase() === normalized) ?? null;
    if (match) return match;
    if (data.users.length < 200) return null; // reached the last page
  }
  return null;
}

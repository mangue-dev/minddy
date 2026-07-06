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

/** Supabase Auth display name: display_name → full_name → name, else null. */
function pickDisplayName(meta: Record<string, unknown>): string | null {
  for (const key of ["display_name", "full_name", "name"]) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Map an auth user to minddy's { email, full_name } display shape. */
export function toNamed(
  user: User | null | undefined
): { email: string | null; full_name: string | null } {
  if (!user) return { email: null, full_name: null };
  return {
    email: user.email ?? null,
    full_name: pickDisplayName((user.user_metadata ?? {}) as Record<string, unknown>),
  };
}

/** Resolve auth users by id in parallel (best-effort; missing ids are skipped). */
export async function fetchAuthUsersById(
  service: SupabaseClient,
  ids: string[]
): Promise<Map<string, User>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const users = await Promise.all(
    unique.map(async (id) => {
      const { data, error } = await service.auth.admin.getUserById(id);
      return error ? null : data.user;
    })
  );
  return new Map(
    users.filter((u): u is User => !!u).map((u) => [u.id, u])
  );
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

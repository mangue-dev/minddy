import "server-only";

import type { User } from "@supabase/supabase-js";

/**
 * Whether a user is a minddy admin — the single gate for the admin dashboard
 * (`/admin`) and its API (`/api/admin/*`).
 *
 * Two sources, either grants access:
 *  - `app_metadata.role === "admin"` (set server-side on the account, tamper-proof
 *    since app_metadata isn't user-writable),
 *  - the `ADMIN_EMAILS` allowlist — a comma-separated list of emails. This is the
 *    primary knob (matches AutoKap): flip an env var, no migration, no code.
 *
 * Takes the minimal shape the JWT claims expose (`getAuthedUser` rebuilds `User`
 * from claims), so it works both from route handlers and server components.
 */
export function isAdminUser(
  user: Pick<User, "email" | "app_metadata"> | null | undefined
): boolean {
  if (!user) return false;

  const role = (user.app_metadata as { role?: string } | undefined)?.role;
  if (role === "admin") return true;

  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return !!user.email && allowlist.includes(user.email.toLowerCase());
}

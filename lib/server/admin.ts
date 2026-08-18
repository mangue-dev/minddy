import "server-only";

import type { User } from "@supabase/supabase-js";

import { getServiceClient } from "@/lib/supabase-service";

/**
 * Whether a user is a minddy admin — the single gate for the admin dashboard
 * (`/admin`) and its API (`/api/admin/*`).
 *
 * Two sources, either grants access:
 * - `app_metadata.role === "admin"` (set server-side on the account, tamper-proof
 * since app_metadata isn't user-writable),
 * - the `ADMIN_EMAILS` allowlist — a comma-separated list of emails. This is the
 * primary knob (matches AutoKap): flip an env var, no migration, no code.
 *
 * ## Why this function is ASYNCHRONOUS (MIN-344)
 *
 * The allowlist compares an ADDRESS, and the JWT carries one — but nothing in the
 * token says this address has been CONFIRMED. Anyone who registers with
 * the address of an admin (typically an admin not yet registered, or a fresh
 * instance of which `ADMIN_EMAILS` is already filled) then obtains the highest privilege of the product without ever having opened the mailbox.
 *
 * The `email_verified` of `user_metadata` does not answer the question: this field
 * is WRITABLE by the user (`auth.updateUser({ data })`), therefore forgeable.
 * The only authoritative source is `email_confirmed_at` on `auth.users`, which we
 * will read at GoTrue as a service key — and we take the opportunity to compare
 * the allowlist to the REAL address of the account, not to that which a token carries.
 *
 * The cost is limited: the reading does not take place only for a candidate whose address is
 * ALREADY in the allowlist (so never for an ordinary visitor), and the result
 * is stored for one minute — the admin dashboard fan-out several routes by
 * display. The `app_metadata.role` branch does not cost any calls.
 *
 * Fail-closed: a failed read does not give access.
 */
export function adminEmailAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** Is the address in `ADMIN_EMAILS`? (normalized case on both sides) */
export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmailAllowlist().includes(email.trim().toLowerCase());
}

/** The role carried by `app_metadata` — the tamper-proof source, without IO. */
export function hasAdminRole(
  user: Pick<User, "app_metadata"> | null | undefined
): boolean {
  return (user?.app_metadata as { role?: string } | undefined)?.role === "admin";
}

const CONFIRMED_TTL_MS = 60_000;
const confirmedCache = new Map<string, { at: number; ok: boolean }>();

/** Test purge — cache is an implementation detail, not shared state. */
export function resetAdminConfirmationCache(): void {
  confirmedCache.clear();
}

/**
 * Does the account have a CONFIRMED address, and is that address the address of
 * on the allowlist? Read at GoTrue (`auth.users`), the only source that is not
 * written by the user.
 */
async function isConfirmedAdminAccount(userId: string): Promise<boolean> {
  const hit = confirmedCache.get(userId);
  if (hit && Date.now() - hit.at < CONFIRMED_TTL_MS) return hit.ok;

  let ok = false;
  try {
    const { data, error } = await getServiceClient().auth.admin.getUserById(userId);
    const account = data?.user;
    if (error) throw new Error(error.message);
    ok = !!account?.email_confirmed_at && isAdminEmail(account?.email);
  } catch (err) {
    // Fail-closed, and no caching of a failure: the next call
    // try again rather than keeping an admin out for a minute because of a hiccup.
    console.error("[admin] email confirmation check failed:", (err as Error).message);
    return false;
  }

  confirmedCache.set(userId, { at: Date.now(), ok });
  return ok;
}

/**
 * Takes the minimal shape the JWT claims expose (`getAuthedUser` rebuilds `User`
 * from claims), so it works both from route handlers and server components.
 */
export async function isAdminUser(
  user: Pick<User, "id" | "email" | "app_metadata"> | null | undefined
): Promise<boolean> {
  if (!user) return false;
  if (hasAdminRole(user)) return true;
  if (!user.id || !isAdminEmail(user.email)) return false;
  return isConfirmedAdminAccount(user.id);
}

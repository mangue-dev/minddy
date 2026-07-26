/**
 * Shared display-name resolution — the single source of truth for how a user is
 * named across the app (activity, mentions, assignees, cards, notifications…).
 *
 * Prefer the account's Supabase Auth display name (resolved server-side from
 * auth.users metadata via lib/server/auth-users.ts). Never surface the raw
 * email: fall back to its local-part as a handle, then to a generic label.
 *
 * Pure (no "use client") so both client components and API routes can use it.
 */

type NamedUser = { full_name?: string | null; email?: string | null };

/** The Supabase auth `user_metadata` keys that can carry a display name. */
export type AuthNameMeta = {
  display_name?: string;
  full_name?: string;
  name?: string;
};

/** The handle part of an email ("bob@minddy.co" → "bob"), or null. */
export function emailLocalPart(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split("@")[0]?.trim();
  return local || null;
}

/** Best display name for a user: display name → email handle → fallback.
    The fallback is a last resort (user has neither name nor email); pass a
    localized string for user-visible call sites. */
export function displayName(
  user: NamedUser | null | undefined,
  fallback = "User"
): string {
  const name = user?.full_name?.trim();
  if (name) return name;
  return emailLocalPart(user?.email) ?? fallback;
}

/** Display name for the signed-in account, read from its Supabase auth
    `user_metadata` (display_name → full_name → name) then the email handle.
    Returned whole — never shortened to the first name — so the sidebar, the
    mobile menu and the rest of the app all name the account the same way. */
export function authDisplayName(
  meta: AuthNameMeta | null | undefined,
  email: string | null | undefined,
  fallback = "User"
): string {
  const full = meta?.display_name || meta?.full_name || meta?.name || null;
  return displayName({ full_name: full, email }, fallback);
}

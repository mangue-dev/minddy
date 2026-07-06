/**
 * Shared display-name resolution — the single source of truth for how a user is
 * named across the app (activity, mentions, assignees, cards, notifications…).
 *
 * Prefer the account's display name (mirrored from the Supabase auth metadata
 * into `profiles.full_name`). Never surface the raw email: fall back to its
 * local-part as a handle, then to a generic label.
 *
 * Pure (no "use client") so both client components and API routes can use it.
 */

type NamedUser = { full_name?: string | null; email?: string | null };

/** The handle part of an email ("bob@minddy.co" → "bob"), or null. */
export function emailLocalPart(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split("@")[0]?.trim();
  return local || null;
}

/** Best display name for a user: display name → email handle → fallback. */
export function displayName(
  user: NamedUser | null | undefined,
  fallback = "Utilisateur"
): string {
  const name = user?.full_name?.trim();
  if (name) return name;
  return emailLocalPart(user?.email) ?? fallback;
}

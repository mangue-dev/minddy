/**
 * What a new account goes through before the app (MIN-907), on every
 * platform: its name and picture, which sign-up no longer asks for. On a
 * phone, the getting-started steps follow as a full-screen tour.
 */

/** Set once the person has confirmed their name and picture. */
export const PROFILE_SETUP_META_KEY = "profile_setup_done";

/**
 * Accounts created before the profile screen existed chose their name at
 * sign-up, or had it from their sign-in service: they never see it.
 */
export const PROFILE_SETUP_SINCE = Date.parse("2026-11-11T00:00:00Z");

interface FirstRunUser {
  created_at?: string;
  user_metadata?: Record<string, unknown> | null;
}

/** Created since the first-run screens exist: older accounts never see them. */
export function isFirstRunAccount(user: FirstRunUser | null | undefined): boolean {
  const created = user?.created_at ? Date.parse(user.created_at) : Number.NaN;
  return Number.isFinite(created) && created >= PROFILE_SETUP_SINCE;
}

export function needsProfileSetup(user: FirstRunUser | null | undefined): boolean {
  if (!user || user.user_metadata?.[PROFILE_SETUP_META_KEY] === true) return false;
  return isFirstRunAccount(user);
}

/** The name a sign-in service gave the account, to start the field with. */
export function suggestedName(meta: Record<string, unknown> | null | undefined): string {
  for (const key of ["display_name", "full_name", "name"]) {
    const value = meta?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * What a new account goes through before the app (MIN-907), on every
 * platform: its name and picture, which sign-up no longer asks for. The
 * getting-started steps follow as a full-screen tour (MIN-964).
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

/** Set on `<html>` while a first-run screen may still come: CSS covers the app. */
export const FIRST_RUN_PENDING_ATTRIBUTE = "data-first-run-pending";

/**
 * Whether the session cookie belongs to an account that may still see a
 * first-run screen (MIN-964): created since they exist, and with its profile
 * or its tour left. Read before the app paints, from the inline script and on
 * a client navigation from sign-in, so the app never shows for a moment
 * before them. A guess only, from the session the browser holds: the gate
 * decides, and lifts the cover when nothing comes.
 *
 * Self-contained: its source is also the inline script.
 */
export function firstRunPendingFromCookies(cookies: string, since: number): boolean {
  try {
    const parts: { index: number; value: string }[] = [];
    const list = cookies ? cookies.split("; ") : [];
    for (let i = 0; i < list.length; i++) {
      const eq = list[i].indexOf("=");
      const match = /^sb-.+-auth-token(?:\.(\d+))?$/.exec(list[i].slice(0, eq));
      if (match) parts.push({ index: match[1] ? Number(match[1]) : 0, value: decodeURIComponent(list[i].slice(eq + 1)) });
    }
    if (parts.length === 0) return false;
    parts.sort((a, b) => a.index - b.index);
    let raw = "";
    for (let j = 0; j < parts.length; j++) raw += parts[j].value;
    if (raw.indexOf("base64-") === 0) {
      const binary = atob(raw.slice(7).replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = new Uint8Array(binary.length);
      for (let k = 0; k < binary.length; k++) bytes[k] = binary.charCodeAt(k);
      raw = new TextDecoder().decode(bytes);
    }
    const user = JSON.parse(raw).user;
    if (!user || !(Date.parse(user.created_at) >= since)) return false;
    const meta = user.user_metadata || {};
    return meta.profile_setup_done !== true || meta.onboarding_dismissed !== true;
  } catch {
    return false;
  }
}

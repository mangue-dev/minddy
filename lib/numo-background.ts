import { resolveNumoMemoryEnabled } from "@/lib/numo-memory";

/**
 * Background Numo (MIN-925): the switch and the limits shared by the server
 * (the wake, the tool guard) and the settings screen.
 */

/** `user_metadata` key of the "Numo in the background" switch (off by default). */
export const NUMO_BACKGROUND_META_KEY = "numo_background";

/**
 * Whether background Numo is on. It needs Numo's memory: the memories are
 * where the user's standing instructions and authorizations live, so with the
 * memory off the switch reads as off, whatever is stored.
 */
export function resolveNumoBackgroundEnabled(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  return String(meta?.[NUMO_BACKGROUND_META_KEY]) === "true" && resolveNumoMemoryEnabled(meta);
}

/** `app_config` key of the daily wake cap per user, set from the admin dashboard. */
export const NUMO_WAKE_DAILY_LIMIT_KEY = "numo_wake_daily_limit";

/** Background turns one user gets in 24 hours when the admin set nothing. */
export const NUMO_WAKE_DAILY_LIMIT_DEFAULT = 20;

/** Highest value the admin may set. */
export const NUMO_WAKE_DAILY_LIMIT_MAX = 500;

/** Urgent notes a background turn may send one user in 24 hours. */
export const NUMO_URGENT_NOTES_PER_DAY = 2;

/** Turns kept in the background conversation before it starts over. */
export const NUMO_BACKGROUND_CONVERSATION_TURNS = 40;

/** Read an admin value of the daily cap: a whole number in range, else the default. */
export function parseNumoWakeDailyLimit(value: string | null | undefined): number {
  const trimmed = value?.trim() ?? "";
  if (!/^\d+$/.test(trimmed)) return NUMO_WAKE_DAILY_LIMIT_DEFAULT;
  const parsed = Number(trimmed);
  return parsed <= NUMO_WAKE_DAILY_LIMIT_MAX ? parsed : NUMO_WAKE_DAILY_LIMIT_DEFAULT;
}

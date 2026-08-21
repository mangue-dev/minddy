/**
 * ACCOUNT THEME — the appearance setting that follows the account, not the
 * device (the account-settings work).
 *
 * Stored in the `user_metadata` of the Supabase account, like [locale] and
 * its neighbors. The localStorage key `mangue-ui-theme` remains, but as a
 * CACHE: mango-ui's ThemeProvider reads and writes it, anonymous visitors
 * (marketing site, public boards) keep using it alone. A signed-in account
 * gets its saved theme re-asserted on every document load:
 *
 * - the proxy reads `user_metadata.theme` off the session JWT and asserts
 *   [`ACCOUNT_THEME_HEADER`] on app routes;
 * - the root layout hands it to [`ThemeInitScript`], which applies it BEFORE
 *   the first paint and mirrors it back into localStorage — so a new device
 *   renders the right theme immediately, with no flash and no stale value;
 * - in-app changes go through [`useAccountTheme`], which writes both the
 *   provider (instant) and `user_metadata` (sync).
 *
 * This module is PURE (no React, no Supabase): the proxy runs on the edge,
 * the layout on the server, the settings screen in the browser — all three
 * read the same definition of "valid theme".
 */

export const ACCOUNT_THEME_META_KEY = "theme";

/** Trusted request header asserted by the proxy (`x-minddy-*` namespace:
 * stripped from clients, rebuilt by the middleware on every request). */
export const ACCOUNT_THEME_HEADER = "x-minddy-theme";

export const ACCOUNT_THEMES = ["light", "dark", "system"] as const;

export type AccountTheme = (typeof ACCOUNT_THEMES)[number];

/** Type guard — the header and the metadata are read back from strings. */
export function isAccountTheme(value: unknown): value is AccountTheme {
  return (
    typeof value === "string" &&
    (ACCOUNT_THEMES as readonly string[]).includes(value)
  );
}

/**
 * The theme saved on the account, or `null` when there isn't one: an absence
 * must stay an absence (the device keeps its own choice) — never invent
 * "system" for an account that never expressed a preference.
 */
export function resolveAccountTheme(
  meta: Record<string, unknown> | null | undefined,
): AccountTheme | null {
  const value = meta?.[ACCOUNT_THEME_META_KEY];
  return isAccountTheme(value) ? value : null;
}

/** The device's cached preference, i.e. what mango-ui persists. Pure twin of
 * the read ThemeInitScript does before the first paint; used at sign-in to
 * claim an existing device choice as the account setting (legacy accounts). */
export function resolveStoredAccountTheme(
  storage: Pick<Storage, "getItem"> | null | undefined,
): AccountTheme | null {
  let stored: string | null = null;
  try {
    stored = storage?.getItem("mangue-ui-theme") ?? null;
  } catch {
    /* localStorage unavailable (private browsing) — no device preference. */
  }
  return isAccountTheme(stored) ? stored : null;
}

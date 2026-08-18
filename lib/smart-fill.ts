/**
 * SMART-FILL (MIN-260) — the account preference, and nothing else.
 *
 * The creation form asks for seven properties for each ticket, including four
 * which can be deduced from what we have just written: priority, effort,
 * categories and objective. Smart-fill asks them at creation, from only
 * title + description. The three that remain — status, assigned, deadline — are not deduced from anything: they say an intention, and they remain in hand.
 *
 * Stored in the `user_metadata` of the Supabase account, like
 * [auto-assign-on-start](auto-assign-on-start.ts) and its neighbors. **Activated by
 * default**: only a `false` explicits the cut — a new account has no
 * metadata at all, and an absence should be read as the default, not as a
 * refusal.
 *
 * This module does not depends on NOTHING (neither React nor Supabase): the creation modal le
 * reads it on the client side, the settings screen writes it, and the server uses it to reread what the client claims. This is the only definition of “enabled”.
 */

export const SMART_FILL_META_KEY = "smart_fill";

/** Does the account have Smart-fill enabled? Enabled by default; only an explicit `false`
 * disables it. */
export function resolveSmartFill(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  return meta?.[SMART_FILL_META_KEY] !== false;
}

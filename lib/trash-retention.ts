/**
 * How long a deleted item remains retrievable (MIN-133).
 *
 * Separate module, without `server-only` nor `"use client"`: the value is read from
 * BOTH sides — by the nightly scan which erases for good
 * (lib/server/retention.ts) and by the sentences that promise the delay to
 * the screen ("restoreable for 30 days"). Letting them live separately,
 * is guaranteeing that one day the app promises a deadline that the cron no longer keeps.
 */
export const TRASH_RETENTION_DAYS = 30;

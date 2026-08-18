/**
 * Offer a plan for a given time — the admin override (MIN-72) carries
 * now an EXPIRATION.
 *
 * Nothing comes to take back the gift: the expiry date is stored on the account
 * (`billing_accounts.admin_override_expires_at`) and the RESOLUTION of the plan
 * ignores it as soon as it passes. The right therefore falls to the nearest second, without
 * depending on a cron or a webhook — the time scan
 * (`expireAdminOverrides`) only cleans the line after the fact.
 *
 * Pure module (UTC dates), importable client AND server: the admin chooses a
 * DURATION, the server transforms it into a date. The client never sends the deadline
 * itself — it is the server's clock that takes precedence.
 */

export const GIFT_DURATIONS = [
  "7d",
  "1m",
  "3m",
  "6m",
  "1y",
  "unlimited",
] as const;

export type GiftDuration = (typeof GIFT_DURATIONS)[number];

/** The duration proposed by default: “offer one month” is the common gesture. */
export const DEFAULT_GIFT_DURATION: GiftDuration = "1m";

/** Duration expressed in calendar months (the rest is counted in days). */
const GIFT_MONTHS: Partial<Record<GiftDuration, number>> = {
  "1m": 1,
  "3m": 3,
  "6m": 6,
  "1y": 12,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function coerceGiftDuration(value: unknown): GiftDuration | null {
  return typeof value === "string" &&
    (GIFT_DURATIONS as readonly string[]).includes(value)
    ? (value as GiftDuration)
    : null;
}

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * `from` + n calendar month, day clamped to the last day of the target month:
 * a month offered on January 31 ends on February 28, not March 3. Same rule
 * as annual sub-cycles (lib/billing-cycle.ts).
 */
function addUtcMonths(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const monthIndex = from.getUTCMonth() + months;
  const target = new Date(Date.UTC(year, monthIndex, 1));
  const day = Math.min(
    from.getUTCDate(),
    daysInUtcMonth(target.getUTCFullYear(), target.getUTCMonth())
  );
  return new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      day,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds()
    )
  );
}

/** The deadline for a gift placed now (ISO). `null` = unlimited. */
export function giftExpiresAt(
  duration: GiftDuration,
  from: Date = new Date()
): string | null {
  if (duration === "unlimited") return null;
  const months = GIFT_MONTHS[duration];
  if (months) return addUtcMonths(from, months).toISOString();
  return new Date(from.getTime() + 7 * DAY_MS).toISOString();
}

/**
 * A gift that has expired no longer gives anything. An unreadable date
 * does NOT count as expired: we do not withdraw a right on a doubt of
 * parsing (the column is a `timestamptz`, the case should not exist).
 */
export function isGiftExpired(
  expiresAt: string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!expiresAt) return false;
  const at = new Date(expiresAt).getTime();
  if (!Number.isFinite(at)) return false;
  return at <= now;
}

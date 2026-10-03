import { intlLocaleByLocale, type Locale } from "@/i18n/config";
import type { ChangelogReleaseSummary } from "./changelog-types";

/** Historical anchors and pagination share one chronological, unique release list. */
export function mergeChangelogReleases(
  current: ChangelogReleaseSummary[], incoming: ChangelogReleaseSummary[],
): ChangelogReleaseSummary[] {
  const releases = new Map(current.map(release => [release.version, release]));
  for (const release of incoming) releases.set(release.version, release);
  return [...releases.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** Latest verified historical publication; live content is loaded on the server. */
export { lastPublishedDate as CHANGELOG_LAST_MODIFIED } from "@/content/changelog/metadata.json";
import { lastPublishedDate } from "@/content/changelog/metadata.json";

/** How long does a delivery remain “new” for the menu tab. */
export const RECENT_CHANGELOG_DAYS = 5;

/**
 * Is there delivery in less than five days? This is indicated by the
 * blue dot in the account menu, in the app.
 *
 * No “read” status behind it: the dot says “something came out this
 * week”, not “you haven’t seen it”. Nothing to store, nothing to synchronize between devices, and it turns off by itself.
 *
 * No lower limit on purpose: the dates are written by hand, in
 * UTC-midnight, and published the same day. A user in Paris who opens the app
 * at 1 a.m. is still the day before in UTC — requiring `age >= 0` would turn off the
 * tablet precisely on the day of release.
 */
export function hasRecentChangelog(now: number = Date.now()): boolean {
  const [year, month, day] = lastPublishedDate.split("-").map(Number);
  const age = now - Date.UTC(year, month - 1, day);
  return age < RECENT_CHANGELOG_DAYS * 24 * 60 * 60 * 1000;
}

/** Readable date in the language served, without depending on the server's time zone. */
export function formatChangelogDate(iso: string, locale: Locale): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocaleByLocale[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * “Two days ago” rather than “July 26, 2026”: what we're looking for when opening a changelog is not the date, it's the freshness. The exact date
 * remains in the `datetime` attribute, which the analyzers read, and in the tooltip.
 *
 * **To the day, never to the hour.** An entry only carries a date: saying
 * "20 hours ago" would give it a precision that it doesn't have. The floor
 * at zero sets the time difference, which would otherwise announce a delivery of the day "in four hours" to a drive east of UTC.
 */
export function formatChangelogAge(
  iso: string,
  locale: Locale,
  now: number = Date.now(),
): string {
  const published = Date.parse(`${iso}T00:00:00Z`);
  const format = new Intl.RelativeTimeFormat(intlLocaleByLocale[locale], {
    numeric: "auto",
  });

  const days = Math.max(0, Math.floor((now - published) / 86_400_000));
  if (days < 30) return format.format(-days, "day");
  const months = Math.floor(days / 30.44);
  if (months < 12) return format.format(-months, "month");
  return format.format(-Math.floor(days / 365.25), "year");
}

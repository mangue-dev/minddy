/**
 * The public changelog (MIN-93) — the list of commits, from newest to
 * oldest.
 *
 * ## Why this file and not the issues `done`
 *
 * The plan proposed to derive the minddy issues page passed to `done` on
 * the project itself: the product would document itself with itself, which is
 * a nice demonstration. Tried, rejected, for three basic reasons:
 *
 * 1. **The language.** Minddy's issues are written in French. The public
 * site is canonical in ENGLISH. An English page filled with "Recast
 * metadata of all pages with i18n" is not an English
 * page, and nothing can translate it on the fly without lying.
 * 2. **The audience.** An issue title is addressed to the person who is going to do it; a
 * changelog entry to whoever uses the product. “Defer import of
 * posthog-js” and “Dashboard admin must trigger breadcrumbs” are
 * real deliveries, and have nothing to do on a public page.
 * 3. **Sorting.** There should be a “public” flag on the outputs, so a
 * migration and one more box in the UI, for a need that a list of
 * fifteen lines covers.
 *
 * Hence: one entry per delivery, written for a reader, in both
 * languages. The action remains the same — when a batch of issues changes to `done`, we
 * adds an entry — but we REWRITE it.
 *
 * ## What this file contains, and what it doesn't contain
 *
 * Only the identifier and the date. The texts live in the namespace
 * `Changelog` of the two catalogs (`entry_<id>_title`, `entry_<id>_body`), with
 * all the rest of the site copy — therefore within the scope of an audit of
 * copy, and translatable like any other string.
 *
 * This is also what allows `lib/public-routes.ts` to import this module to
 * extract the `lastModified` from the page without burdening the middleware: even in
 * five years, this file will only weigh identifiers and dates.
 *
 * ## Add an entry
 *
 * At the top of the list: `{ id: "<slug-court>", date: "AAAA-MM-JJ" }`, the date of
 * DEPLOYMENT, then `entry_<id>_title` and `entry_<id>_body` in `en.json` and
 * `fr.json`. `changelog.test.ts` rejects input without text, a poorly formed date
 *, or a poorly sorted list.
 */

import { intlLocaleByLocale, type Locale } from "@/i18n/config";

export interface ChangelogEntry {
  /** Stable slug: i18n key, URL anchor and `guid` of the RSS feed. */
  id: string;
  /** Deployment date, short ISO. */
  date: string;
}

/** Newest to oldest — this is the display order AND the order of the feed. */
export const CHANGELOG_ENTRIES: ReadonlyArray<ChangelogEntry> = [
  { id: "open-source", date: "2026-08-26" },
  { id: "desktop-app", date: "2026-08-26" },
  { id: "activity-breakdowns", date: "2026-08-25" },
  { id: "custom-avatar", date: "2026-08-25" },
  { id: "feedback-page-tabs", date: "2026-08-22" },
  { id: "account-transfer", date: "2026-08-20" },
  { id: "own-ai-everywhere", date: "2026-08-20" },
  { id: "github-dependencies", date: "2026-08-19" },
  { id: "live-page-edits", date: "2026-08-19" },
  { id: "local-agent", date: "2026-08-15" },
  { id: "pages", date: "2026-08-11" },
  { id: "smart-fill", date: "2026-08-10" },
  { id: "board-multi-select", date: "2026-08-09" },
  { id: "issue-sync", date: "2026-08-07" },
  { id: "invite-by-email", date: "2026-08-07" },
  { id: "routines", date: "2026-08-06" },
  { id: "push-notifications", date: "2026-08-06" },
  { id: "project-start", date: "2026-08-06" },
  { id: "smart-assign", date: "2026-08-06" },
  { id: "feedback-comments", date: "2026-08-06" },
  { id: "resources", date: "2026-08-06" },
  { id: "feedback-setup", date: "2026-08-06" },
  { id: "feedback-translation", date: "2026-08-06" },
  { id: "export-issues", date: "2026-08-06" },
  { id: "pull-requests", date: "2026-08-03" },
  { id: "pr-review", date: "2026-08-03" },
  { id: "automations", date: "2026-08-03" },
  { id: "recurring-issues", date: "2026-08-03" },
  { id: "own-api-key", date: "2026-08-03" },
  { id: "mentions", date: "2026-08-03" },
  { id: "trash", date: "2026-07-31" },
  { id: "import-issues", date: "2026-07-31" },
  { id: "home-attention", date: "2026-07-31" },
  { id: "zen-mode", date: "2026-07-31" },
  { id: "account-data", date: "2026-07-31" },
  { id: "agent-brief", date: "2026-07-31" },
  { id: "mcp-page", date: "2026-07-27" },
  { id: "localised-site", date: "2026-07-27" },
  { id: "search-everywhere", date: "2026-07-26" },
  { id: "notebook-agent", date: "2026-07-24" },
  { id: "notifications", date: "2026-07-24" },
];

/**
 * The date of the last entry, as read by the sitemap and the
 * header of the page. This is the only `lastModified` in the routes table that is not
 * hand-held: on this page, "the content has changed" and "an
 * entry has been added" are exactly the same thing.
 */
export const CHANGELOG_LAST_MODIFIED: string = CHANGELOG_ENTRIES[0].date;

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
  const [year, month, day] = CHANGELOG_LAST_MODIFIED.split("-").map(Number);
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

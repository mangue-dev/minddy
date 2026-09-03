import type { Locale } from "@/i18n/config";
import { formatChangelogAge, formatChangelogDate } from "@/lib/changelog";
import { AppTooltip } from "@/components/ui/app-tooltip";

/**
 * The list of deliveries, as it appears — shared by the page
 * public `/changelog` and by the “New features” modal of the app.
 *
 * The component translates NOTHING: it receives titles and bodies already
 * resolved. This is what allows it to be made on both sides of the border
 * server/client without costing anything. The root layout only sends to the browser
 * the four namespaces of the public site (MIN-100); a client component that
 * would call `useTranslations("Changelog")` would display key paths
 * on `/changelog`, or would require embedding the namespace — which grows to
 * each delivery — in the landing bundle. Both callers know
 * already translate, each with its half of next-intl.
 */

export interface ChangelogEntryContent {
  /** Stable slug: URL anchor and `guid` of the RSS feed. */
  id: string;
  /** Deployment date, short ISO. */
  date: string;
  title: string;
  body: string;
}

export function ChangelogEntries({
  entries,
  locale,
}: {
  entries: ReadonlyArray<ChangelogEntryContent>;
  locale: Locale;
}) {
  return (
    <ol className="flex flex-col">
      {entries.map((entry) => (
        // The anchor allows you to clock a precise delivery — that's what we
        // sticks in a response to a user who was expecting something.
        <li
          key={entry.id}
          id={entry.id}
          className="scroll-mt-24 border-b border-border py-8 first:pt-0 last:border-b-0"
        >
          <AppTooltip label={formatChangelogDate(entry.date, locale)}>
            <time
              dateTime={entry.date}
              className="mb-3 block w-fit font-mono text-xs text-muted-foreground"
            >
              {formatChangelogAge(entry.date, locale)}
            </time>
          </AppTooltip>
          <h2 className="mb-3 text-xl font-semibold tracking-tight text-balance sm:text-2xl">
            {entry.title}
          </h2>
          <p className="leading-relaxed text-pretty text-muted-foreground">
            {entry.body}
          </p>
        </li>
      ))}
    </ol>
  );
}

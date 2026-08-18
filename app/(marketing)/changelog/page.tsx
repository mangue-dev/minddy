import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Rss } from "lucide-react";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { CHANGELOG_ENTRIES } from "@/lib/changelog";
import { changelogFeedPath } from "@/lib/changelog-feed";
import { Reveal, RevealHeading } from "@/components/marketing/reveal";
import { SectionCta } from "@/components/marketing/section-cta";
import { ChangelogEntries } from "@/components/changelog-entries";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * `/changelog` — what was delivered, from newest to oldest (MIN-93).
 *
 * A changelog page is worth less for what it says than for what it says
 * proves: that the product moves, and how often. It is also the only
 * site page whose freshness is intrinsic — and freshness is the
 * first criterion of Perplexity.
 *
 * Hence two choices: each entry DISPLAYS its age — “two days ago”, which
 * answers the question we really ask ourselves, the exact date remaining in the
 * `<time datetime>` that the analyzers read — and the `lastModified` of the sitemap
 * is derived from the last entry rather than handheld.
 *
 * Entries come from `lib/changelog.ts` — its header explains why
 * they are handwritten rather than derived from `done` issues.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as Locale;
  const base = await publicPageMetadata({ routeKey: "changelog", locale });

  return {
    ...base,
    alternates: {
      ...base.alternates,
      // What a feed reader — and some crawlers — are looking for when
      // he “discovers” a site: a `alternate` tag in the `<head>`.
      types: { "application/rss+xml": [{ url: changelogFeedPath(locale), title: "minddy" }] },
    },
  };
}

export default async function ChangelogPage() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("Changelog");

  return (
    <>
      <section className="pt-24 pb-12 sm:pt-28 sm:pb-16">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <RevealHeading
            as="h1"
            className="mb-6 text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-5xl"
            text={t("heroTitle")}
          />
          {/* No subtitle: "one entry per delivery, the most recent in
 top" described aloud a dated list which reads all
 alone, ten pixels lower. The title, the feed link, the
 entries. */}
          <Reveal delay={0.15}>
            <a
              href={changelogFeedPath(locale)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              <Rss className="h-3.5 w-3.5" aria-hidden />
              {t("subscribe")}
            </a>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border py-12 sm:py-16">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          {/* Same list as the “New features” modal of the app, in the component
 except: both surfaces say the same thing. */}
          <ChangelogEntries
            locale={locale}
            entries={CHANGELOG_ENTRIES.map((entry) => ({
              ...entry,
              title: t(`entry_${entry.id}_title` as MessageKey<"Changelog">),
              body: t(`entry_${entry.id}_body` as MessageKey<"Changelog">),
            }))}
          />
        </div>
      </section>

      <SectionCta />
    </>
  );
}

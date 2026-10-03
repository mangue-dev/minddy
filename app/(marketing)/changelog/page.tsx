import { HugeiconsIcon } from "@hugeicons/react";
import { RssIcon } from "@hugeicons/core-free-icons";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { getChangelogPage } from "@/lib/server/changelog";
import { changelogFeedPath } from "@/lib/changelog-feed";
import { Reveal, RevealHeading } from "@/components/marketing/reveal";
import { SectionCta } from "@/components/marketing/section-cta";
import { ChangelogEntries } from "@/components/changelog-entries";

/** Public production releases, with localized details ready before opening. */
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

  const initial = await getChangelogPage(locale);

  return (
    <>
      <section className="pt-24 pb-12 sm:pt-28 sm:pb-16">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <RevealHeading
            as="h1"
            className="mb-6 text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-5xl"
            text={t("heroTitle")}
          />
          <Reveal delay={0.15}>
            <a
              href={changelogFeedPath(locale)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              <HugeiconsIcon icon={RssIcon} className="h-3.5 w-3.5" aria-hidden />
              {t("subscribe")}
            </a>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border py-12 sm:py-16">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <ChangelogEntries
            locale={locale}
            initial={initial}
            labels={{ more: t("more"), loading: t("loading"), error: t("error"),
              retry: t("retry"), details: t("details") }}
          />
        </div>
      </section>

      <SectionCta />
    </>
  );
}

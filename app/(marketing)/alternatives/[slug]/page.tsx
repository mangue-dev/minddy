import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowRight,
  ArrowUpRight,
  Code2,
  ExternalLink,
  FileText,
  GitPullRequest,
  ListChecks,
  MessagesSquare,
  Mic,
  type LucideIcon,
} from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import {
  COMPARISONS,
  COMPARISON_FEATURES,
  COMPARISON_POINTS,
  COMPARISON_ROWS,
  comparisonBySlug,
} from "@/lib/comparisons";
import { localizedHref } from "@/lib/locale-href";
import { routeByKey } from "@/lib/public-routes";
import { FeatureTable } from "@/components/marketing/feature-table";
import { Reveal, RevealGroup, RevealHeading } from "@/components/marketing/reveal";
import { SectionCta } from "@/components/marketing/section-cta";
import { TrackedCta } from "@/components/marketing/tracked-cta";
import { Github } from "@/components/git/provider-icons";
import { MINDDY_REPOSITORY_URL } from "@/lib/brand-constants";

const FEATURE_ICONS = {
  openSource: Code2,
  pages: FileText,
  scratchpad: ListChecks,
  feedback: MessagesSquare,
  pullRequests: GitPullRequest,
  voice: Mic,
} as const satisfies Record<(typeof COMPARISON_FEATURES)[number], LucideIcon>;

/**
 * `/alternatives/<tool>` — a competitor comparison page (MIN-93).
 *
 * The page is built to be cited, not to win a debate. The table compares
 * verifiable structural differences, the product section shows minddy's
 * current scope, and the balanced section states where each tool fits.
 * The rationale and competitor selection live in `lib/comparisons.ts`.
 *
 * Minddy's price comes from `BILLING_PLANS`, like everywhere else: one page
 * which announces an expired price is worse than a missing page.
 */

export function generateStaticParams() {
  return COMPARISONS.map((comparison) => ({ slug: comparison.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const comparison = comparisonBySlug((await params).slug);
  if (!comparison) return {};
  return publicPageMetadata({
    routeKey: comparison.routeKey,
    locale: (await getLocale()) as Locale,
  });
}

export default async function AlternativePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const comparison = comparisonBySlug((await params).slug);
  // `generateStaticParams` only makes the three known slugs, but the
  // route remains dynamic: `/alternatives/asana` must return 404, not
  // render an empty page.
  if (!comparison) notFound();

  const locale = (await getLocale()) as Locale;
  const [t, tc, tb, tl] = await Promise.all([
    getTranslations("Alternatives"),
    getTranslations(comparison.namespace),
    getTranslations("Billing"),
    getTranslations("Landing"),
  ]);

  const mcpRoute = routeByKey("mcp");
  const pricingRoute = routeByKey("pricing");

  return (
    <>
      <section className="pt-24 pb-16 sm:pt-28 sm:pb-20">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <RevealHeading
            as="h1"
            className="mb-4 text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-5xl"
            text={tc("heroTitle")}
          />
          <Reveal
            as="p"
            delay={0.15}
            className="max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground"
          >
            {tc("heroSubtitle")}
          </Reveal>
          <Reveal delay={0.25} className="mt-8 flex flex-col items-start gap-3 sm:flex-row">
            <Button asChild size="lg">
              <TrackedCta href="/signup" location="comparison">
                {tl("heroCtaPrimary")}
                <ArrowRight data-icon="inline-end" />
              </TrackedCta>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={MINDDY_REPOSITORY_URL} target="_blank" rel="noreferrer">
                <Github data-icon="inline-start" />
                {t("viewSource")}
                <ArrowUpRight data-icon="inline-end" />
              </a>
            </Button>
          </Reveal>
        </div>
      </section>

      {/* ── The table ────────────────────────── ─────────────────────────── */}
      <section className="border-t border-border py-16 sm:py-20">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <header className="mb-10 max-w-2xl">
            <RevealHeading
              className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
              text={t("compareTitle")}
            />
            <Reveal as="p" delay={0.15} className="leading-relaxed text-pretty text-muted-foreground">
              {t("compareSubtitle")}
            </Reveal>
          </header>

          <FeatureTable
            caption={tc("heroTitle")}
            includedLabel={tb("included")}
            notIncludedLabel={tb("notIncluded")}
            framed
            columns={[
              { key: "minddy", label: t("columnUs"), highlighted: true },
              { key: comparison.slug, label: comparison.name },
            ]}
            groups={[
              {
                key: "compare",
                label: t("group_compare"),
                rows: COMPARISON_ROWS.map((row) => ({
                  key: row,
                  label: t(`row_${row}`),
                  cells: [t(`minddy_${row}`), tc(`them_${row}`)],
                })),
              },
            ]}
          />

          {/* A comparison without a date or source is only an opinion. Link to
              both official documentation and pricing so readers can verify it. */}
          <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-muted-foreground">
            {t("checkedNote")}{" "}
            <a
              href={comparison.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-4"
            >
              {t("checkedDocsLink", { name: comparison.name })}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
            <span aria-hidden>·</span>
            <a
              href={comparison.pricingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-4"
            >
              {t("checkedLink", { name: comparison.name })}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </p>
        </div>
      </section>

      <section className="border-t border-border bg-muted/20 py-16 sm:py-20">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <header className="mb-10 max-w-2xl">
            <RevealHeading
              className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
              text={t("productTitle")}
            />
            <Reveal
              as="p"
              delay={0.15}
              className="leading-relaxed text-pretty text-muted-foreground"
            >
              {t("productSubtitle")}
            </Reveal>
          </header>

          <RevealGroup
            as="ul"
            step={0.07}
            className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2"
          >
            {COMPARISON_FEATURES.map((feature) => {
              const Icon = FEATURE_ICONS[feature];
              return (
                <li key={feature} className="bg-card p-6">
                  <Icon className="mb-5 h-5 w-5 text-primary" aria-hidden />
                  <h3 className="font-medium">{t(`feature_${feature}_title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t(`feature_${feature}_body`)}
                  </p>
                </li>
              );
            })}
          </RevealGroup>
        </div>
      </section>

      {/* ── What the other tool does better, first ───────────────────────── */}
      <section className="border-t border-border py-16 sm:py-20">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <div className="grid gap-12 md:grid-cols-2 md:gap-16">
            <div>
              <h2 className="mb-5 text-2xl font-semibold tracking-tight text-balance">
                {t("betterThemTitle", { name: comparison.name })}
              </h2>
              <RevealGroup as="ul" step={0.07} className="flex flex-col gap-4">
                {COMPARISON_POINTS.map((point) => (
                  <li key={point} className="text-sm leading-relaxed text-muted-foreground">
                    {tc(`betterThem_${point}`)}
                  </li>
                ))}
              </RevealGroup>
            </div>

            <div>
              <h2 className="mb-5 text-2xl font-semibold tracking-tight text-balance">
                {t("betterUsTitle")}
              </h2>
              <RevealGroup as="ul" step={0.07} className="flex flex-col gap-4">
                {COMPARISON_POINTS.map((point) => (
                  <li key={point} className="text-sm leading-relaxed text-muted-foreground">
                    {tc(`betterUs_${point}`)}
                  </li>
                ))}
              </RevealGroup>
            </div>
          </div>
        </div>
      </section>

      {/* ── The verdict ────────────────────────── ─────────────────────────── */}
      <section className="border-t border-border py-16 sm:py-20">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <RevealHeading
            className="mb-6 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
            text={t("verdictTitle")}
          />
          <Reveal as="p" delay={0.1} className="mb-4 leading-relaxed text-pretty text-muted-foreground">
            {tc("verdictThem")}
          </Reveal>
          <Reveal as="p" delay={0.15} className="mb-8 leading-relaxed text-pretty text-foreground">
            {tc("verdictUs")}
          </Reveal>

          <Reveal delay={0.2} className="flex flex-wrap items-center gap-5">
            <Button asChild size="lg">
              <TrackedCta href="/signup" location="comparison">
                {tl("ctaButton")}
                <ArrowRight data-icon="inline-end" />
              </TrackedCta>
            </Button>
            <Link
              href={localizedHref(mcpRoute.en, locale)}
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t("seeMcp")}
            </Link>
            {/* Prices remain on the pricing page, where they derive from
                `BILLING_PLANS` instead of becoming stale copy here. */}
            <Link
              href={localizedHref(pricingRoute.en, locale)}
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              {t("seePricing")}
            </Link>
          </Reveal>
        </div>
      </section>

      <SectionCta />
    </>
  );
}

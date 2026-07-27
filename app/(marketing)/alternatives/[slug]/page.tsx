import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import {
  COMPARISONS,
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

/**
 * `/alternatives/<outil>` — un comparatif par concurrent (MIN-93).
 *
 * La page est bâtie pour être CITÉE, pas pour gagner un débat : elle ouvre sur
 * ce que l'autre outil fait mieux, et son tableau ne compare que cinq
 * différences de structure. Le pourquoi de ce parti pris, et le choix des trois
 * concurrents, sont dans `lib/comparisons.ts`.
 *
 * Le prix de minddy vient de `BILLING_PLANS`, comme partout ailleurs : une page
 * qui annonce un tarif périmé est pire qu'une page absente.
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
  // `generateStaticParams` ne fabrique que les trois slugs connus, mais la
  // route reste dynamique : `/alternatives/asana` doit tomber en 404, pas
  // rendre une page vide.
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
        </div>
      </section>

      {/* ── Le tableau ───────────────────────────────────────────────────── */}
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

          {/* Une comparaison sans date ni source est une opinion. Celle-ci dit
              quand elle a été vérifiée et renvoie chez l'autre. */}
          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            {t("checkedNote")}{" "}
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

      {/* ── Ce que l'autre fait mieux, d'abord ───────────────────────────── */}
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

      {/* ── Le verdict ───────────────────────────────────────────────────── */}
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
            {/* Le tableau ne cite aucun prix — c'est la page tarifs qui fait
                foi, et elle est dérivée de `BILLING_PLANS`. Un chiffre recopié
                ici serait faux au premier changement. */}
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

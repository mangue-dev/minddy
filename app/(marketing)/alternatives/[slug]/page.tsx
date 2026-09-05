import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Bot, Check, Code2, Download, ExternalLink, FileText, Import, MessagesSquare, Mic, Repeat2, Target, type LucideIcon } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { cn } from "mangue-ui/lib/utils";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { COMPARISONS, COMPARISON_FEATURES, COMPARISON_POINTS, COMPARISON_ROWS, COMPARISON_REVIEWED_AT, comparisonBySlug } from "@/lib/comparisons";
import { localizedHref } from "@/lib/locale-href";
import { CARD_TONES } from "@/components/marketing/card-tones";
import { SectionHeading } from "@/components/marketing/section-heading";
import { ScreenshotSlot } from "@/components/marketing/screenshot-slot";
import type { ScreenshotSlotId } from "@/components/marketing/screenshot-slots";
import { TrackedCta } from "@/components/marketing/tracked-cta";
import { Github } from "@/components/git/provider-icons";
import { MINDDY_REPOSITORY_URL } from "@/lib/brand-constants";

const FEATURES = {
  agents: { icon: Bot, tone: CARD_TONES.lavender, screenshot: "workflowAgent" },
  pages: { icon: FileText, tone: CARD_TONES.sky, screenshot: "pagesEditor" },
  numo: { icon: Bot, tone: CARD_TONES.butter },
  routines: { icon: Repeat2, tone: CARD_TONES.peach },
  planning: { icon: Target, tone: CARD_TONES.sage },
  feedback: { icon: MessagesSquare, tone: CARD_TONES.sky },
  capture: { icon: Mic, tone: CARD_TONES.lavender },
  openSource: { icon: Code2, tone: CARD_TONES.sage },
} as const satisfies Record<(typeof COMPARISON_FEATURES)[number], { icon: LucideIcon; tone: string; screenshot?: ScreenshotSlotId }>;

export function generateStaticParams() {
  return COMPARISONS.map(comparison => ({ slug: comparison.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const comparison = comparisonBySlug((await params).slug);
  if (!comparison) return {};
  return publicPageMetadata({ routeKey: comparison.routeKey, locale: (await getLocale()) as Locale });
}

/** One sourced comparison layout serves every competitor and locale. */
export default async function AlternativePage({ params }: { params: Promise<{ slug: string }> }) {
  const comparison = comparisonBySlug((await params).slug);
  if (!comparison) notFound();
  const locale = (await getLocale()) as Locale;
  const [t, tc, tl] = await Promise.all([getTranslations("Alternatives"), getTranslations(comparison.namespace), getTranslations("Landing")]);
  const reviewedDate = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${COMPARISON_REVIEWED_AT}T12:00:00Z`));
  const downloadHref = localizedHref("/download", locale);

  return (
    <>
      <section className="px-4 pt-24 pb-12 sm:px-6 sm:pt-32 sm:pb-16">
        <div className="mx-auto max-w-6xl">
          <nav aria-label={t("compareNavLabel")} className="mb-8 flex flex-wrap gap-2">
            {COMPARISONS.map(item => (
              <Link key={item.slug} href={localizedHref(`/alternatives/${item.slug}`, locale)} aria-current={item.slug === comparison.slug ? "page" : undefined}
                className={cn("inline-flex min-h-11 items-center rounded-full px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", item.slug === comparison.slug ? "bg-[#f3f5ef] font-medium dark:bg-[#202821]" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}>
                {item.name}
              </Link>
            ))}
          </nav>
          <h1 className="max-w-5xl text-[clamp(2.5rem,5.8vw,5rem)] leading-[1.06] font-medium tracking-[-0.055em] text-balance">{tc("heroTitle")}</h1>
          <p className="mt-7 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">{tc("heroSubtitle")}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="rounded-full">
              <TrackedCta href={downloadHref} location="comparison">{tl("downloadMinddy")}<Download data-icon="inline-end" /></TrackedCta>
            </Button>
            <a href="#comparison" className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
              {t("compareTitle")}<ArrowRight className="size-4" aria-hidden />
            </a>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 sm:pb-20">
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2">
          {[
            { title: t("betterThemTitle", { name: comparison.name }), body: tc("verdictThem"), tone: CARD_TONES.sky },
            { title: t("betterUsTitle"), body: tc("verdictUs"), tone: CARD_TONES.sage },
          ].map(point => (
            <article key={point.title} className={cn("rounded-2xl p-6 sm:p-8", point.tone)}>
              <h2 className="text-2xl leading-tight font-medium tracking-tight">{point.title}</h2>
              <p className="mt-4 text-sm leading-relaxed opacity-80">{point.body}</p>
            </article>
          ))}

        </div>
      </section>

      <section id="comparison" className="scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={t("compareTitle")} description={t("compareSubtitle")} />
          <div role="region" aria-label={tc("heroTitle")} tabIndex={0} className="overflow-x-auto rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4">
            <table aria-describedby="comparison-sources" className="w-full min-w-[720px] table-fixed border-separate border-spacing-0 text-sm">
              <caption className="sr-only">{tc("heroTitle")}</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 w-[24%] bg-[#f7f7f4] px-5 py-6 text-left text-base font-medium dark:bg-[#222321]">{t("group_compare")}</th>
                  <th scope="col" className={cn("px-5 py-6 text-left text-xl font-medium tracking-tight", CARD_TONES.sage)}>{t("columnUs")}</th>
                  <th scope="col" className={cn("px-5 py-6 text-left text-xl font-medium tracking-tight", CARD_TONES.sky)}>{comparison.name}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map(row => (
                  <tr key={row}>
                    <th scope="row" className="sticky left-0 z-10 border-t border-black/5 bg-[#f7f7f4] px-5 py-5 text-left font-medium dark:border-white/5 dark:bg-[#222321]">{t(`row_${row}`)}</th>
                    <td className={cn("border-t border-black/5 px-5 py-5 leading-relaxed dark:border-white/5", CARD_TONES.sage)}>{t(`minddy_${row}`)}</td>
                    <td className={cn("border-t border-black/5 px-5 py-5 leading-relaxed dark:border-white/5", CARD_TONES.sky)}>
                      {tc(`them_${row}`)}{" "}
                      {comparison.sources[row] && <a href={comparison.sources[row]} target="_blank" rel="noopener noreferrer" aria-label={t("sourceFor", { name: comparison.name, feature: t(`row_${row}`) })} className="inline-flex size-6 translate-y-1 items-center justify-center rounded-full opacity-65 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-current"><ExternalLink className="size-3.5" aria-hidden /></a>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{t("billingNote")} <Link href={localizedHref("/pricing", locale)} className="font-medium text-foreground underline underline-offset-4">{t("seePricing")}</Link></p>
          <div id="comparison-sources" className="mt-4 text-xs leading-relaxed text-muted-foreground">
            <p>{t("checkedNote", { date: reviewedDate })}</p>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
              {[[comparison.docsUrl, t("checkedDocsLink", { name: comparison.name })], [comparison.pricingUrl, t("checkedLink", { name: comparison.name })]].map(([href, label]) => (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{label}<ExternalLink className="size-3.5" aria-hidden /></a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="bg-[#f4f6f9] px-4 py-16 sm:px-6 sm:py-20 dark:bg-[#12171d]">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={t("productTitle")} description={t("productSubtitle")} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
            {COMPARISON_FEATURES.map(feature => {
              const item = FEATURES[feature];
              const screenshot = "screenshot" in item ? item.screenshot : null;
              return <article key={feature} className={cn("flex min-w-0 flex-col rounded-2xl p-6 sm:p-8", item.tone, screenshot ? "md:col-span-3" : "md:col-span-2")}>
                <item.icon className="mb-5 size-6" strokeWidth={1.5} aria-hidden />
                <h3 className="text-2xl leading-tight font-medium tracking-tight">{t(`feature_${feature}_title`)}</h3>
                <p className="mt-3 text-sm leading-relaxed opacity-80">{t(`feature_${feature}_body`)}</p>
                {feature === "openSource" && <a href={MINDDY_REPOSITORY_URL} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex min-h-11 w-fit items-center gap-2 rounded-sm pt-5 text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current"><Github className="size-4" aria-hidden />{t("viewSource")}<ExternalLink className="size-3.5" aria-hidden /></a>}
                {screenshot && <div className="mt-auto pt-7"><ScreenshotSlot id={screenshot} expandable sizes="(min-width: 1024px) 500px, (min-width: 768px) 45vw, 100vw" className="w-full shadow-lg shadow-black/5" /></div>}
              </article>;
            })}
          </div>
          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{t("aiNote")}</p>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={t("verdictTitle")} description={t("verdictSubtitle")} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { title: t("betterThemTitle", { name: comparison.name }), prefix: "betterThem" as const, tone: CARD_TONES.sky },
              { title: t("betterUsTitle"), prefix: "betterUs" as const, tone: CARD_TONES.sage },
            ].map(point => (
              <article key={point.prefix} className={cn("rounded-2xl p-6 sm:p-8", point.tone)}>
                <h3 className="text-2xl font-medium tracking-tight">{point.title}</h3>
                <ul className="mt-6 space-y-5">
                  {COMPARISON_POINTS.map(index => <li key={index} className="flex gap-3 text-sm leading-relaxed"><Check className="mt-0.5 size-4 shrink-0" aria-hidden />{tc(`${point.prefix}_${index}`)}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pt-4 pb-20 sm:px-6 sm:pb-28">
        <div className={cn("mx-auto max-w-6xl rounded-2xl p-6 sm:p-10", CARD_TONES.peach)}>
          <Import className="mb-5 size-6" strokeWidth={1.5} aria-hidden />
          <h2 className="max-w-3xl text-3xl leading-tight font-medium tracking-[-0.035em] sm:text-4xl">{t("migrationTitle")}</h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed opacity-80">{t("migrationBody", { name: comparison.name })}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button asChild size="lg" className="rounded-full"><TrackedCta href={downloadHref} location="comparison">{tl("downloadMinddy")}<ArrowRight data-icon="inline-end" /></TrackedCta></Button>
            <Link href={localizedHref("/mcp", locale)} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current">{t("seeMcp")}<ArrowRight className="size-4" aria-hidden /></Link>
          </div>
        </div>
      </section>
    </>
  );
}

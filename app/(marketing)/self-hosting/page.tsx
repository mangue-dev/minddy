import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Check, Database, Download, Globe2, HardDrive, RefreshCw, Server, ShieldCheck, Upload, Wrench } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { cn } from "mangue-ui/lib/utils";
import packageJson from "@/package.json";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { localizedHref } from "@/lib/locale-href";
import { MINDDY_REPOSITORY_URL } from "@/lib/site";
import { Github } from "@/components/git/provider-icons";
import { CARD_TONES } from "@/components/marketing/card-tones";
import { SectionHeading } from "@/components/marketing/section-heading";
import { ScreenshotSlot } from "@/components/marketing/screenshot-slot";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "selfHosting", locale: (await getLocale()) as Locale });
}

const FOUNDATIONS = [
  { key: "app", icon: Server, tone: CARD_TONES.sky },
  { key: "supabase", icon: Database, tone: CARD_TONES.lavender },
  { key: "data", icon: HardDrive, tone: CARD_TONES.sage },
] as const;
const OPERATIONS = [
  { key: "backup", icon: Database },
  { key: "update", icon: RefreshCw },
  { key: "diagnose", icon: Wrench },
] as const;

export default async function SelfHostingPage() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("SelfHosting");
  const installHref = localizedHref("/self-hosting/install", locale);
  const releaseBase = `${MINDDY_REPOSITORY_URL}/blob/v${packageJson.version}`;

  return (
    <>
      <section className="px-4 pt-24 pb-12 sm:px-6 sm:pt-32 sm:pb-16">
        <div className="mx-auto max-w-6xl">
          <header className="mb-12 max-w-3xl sm:mb-16">
            <h1 className="text-[clamp(2.5rem,5.8vw,5rem)] leading-[1.06] font-medium tracking-[-0.055em] text-balance">{t("heroTitle")}</h1>
            <p className="mt-7 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">{t("heroSubtitle")}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-full">
                <a href={installHref}>{t("heroCtaPrimary")}<ArrowRight data-icon="inline-end" /></a>
              </Button>
              <a href={MINDDY_REPOSITORY_URL} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                <Github className="size-4" aria-hidden />{t("repositoryCta")}
              </a>
            </div>
          </header>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className={cn("flex items-center rounded-2xl p-4 sm:p-6 lg:col-span-2", CARD_TONES.sage)}>
              <ScreenshotSlot id="heroBoard" expandable sizes="(min-width: 1024px) 710px, 100vw" className="w-full shadow-lg shadow-black/5" />
            </div>
            <div className={cn("rounded-2xl p-6 sm:p-8", CARD_TONES.butter)}>
              <ShieldCheck className="mb-5 size-6" strokeWidth={1.5} aria-hidden />
              <h2 className="text-2xl font-medium tracking-tight">{t("promiseTitle")}</h2>
              <p className="mt-3 text-sm leading-relaxed opacity-80">{t("promiseBody")}</p>
              <ul className="mt-7 space-y-4">
                {(["promiseOne", "promiseTwo", "promiseThree"] as const).map(key => (
                  <li key={key} className="flex gap-3 text-sm leading-relaxed"><Check className="mt-0.5 size-4 shrink-0" aria-hidden />{t(key)}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="routes" className="scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={t("routesTitle")} description={t("routesBody")} />
          <div className="grid gap-4 lg:grid-cols-2">
            {[
              { key: "local", icon: HardDrive, tone: CARD_TONES.sky, title: t("localTitle"), body: t("localBody"), time: t("localTime"), facts: [t("localFactUsers"), t("localFactNetwork"), t("localFactMemory")], cta: t("routeCtaLocal") },
              { key: "team", icon: Globe2, tone: CARD_TONES.lavender, title: t("teamTitle"), body: t("teamBody"), time: t("teamTime"), facts: [t("teamFactUsers"), t("teamFactNetwork"), t("teamFactMemory")], cta: t("routeCtaTeam") },
            ].map(route => (
              <article key={route.key} className={cn("flex flex-col rounded-2xl p-6 sm:p-8", route.tone)}>
                <div className="flex items-center justify-between gap-4">
                  <route.icon className="size-6 shrink-0" strokeWidth={1.5} aria-hidden />
                  <span className="text-right text-xs font-medium opacity-75">{route.time}</span>
                </div>
                <h3 className="mt-7 text-3xl leading-tight font-medium tracking-[-0.035em]">{route.title}</h3>
                <p className="mt-4 max-w-xl text-sm leading-relaxed opacity-80">{route.body}</p>
                <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-3">
                  {route.facts.map(fact => <li key={fact} className="flex items-center gap-2 text-sm"><Check className="size-4 shrink-0" aria-hidden />{fact}</li>)}
                </ul>
                <div className="mt-auto pt-8">
                  <a href={`${installHref}?route=${route.key}`}
                    className="inline-flex min-h-11 items-center gap-3 rounded-full bg-background/70 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current">
                    {route.cta}<ArrowRight className="size-4 shrink-0" aria-hidden />
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f4f6f9] px-4 py-16 sm:px-6 sm:py-20 dark:bg-[#12171d]">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={t("howTitle")} description={t("howBody")} />
          <div className="grid gap-4 md:grid-cols-3">
            {FOUNDATIONS.map(point => (
              <article key={point.key} className={cn("rounded-2xl p-6 sm:p-8", point.tone)}>
                <point.icon className="mb-5 size-6" strokeWidth={1.5} aria-hidden />
                <h3 className="text-xl font-medium tracking-tight">{t(`foundation_${point.key}_title`)}</h3>
                <p className="mt-3 text-sm leading-relaxed opacity-80">{t(`foundation_${point.key}_body`)}</p>
              </article>
            ))}
          </div>
          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{t("howBoundary")}</p>
          <article className={cn("mt-8 rounded-2xl p-6 sm:p-8", CARD_TONES.peach)}>
            <h3 className="text-2xl font-medium tracking-tight">{t("limitsTitle")}</h3>
            <div className="mt-4 grid gap-5 text-sm leading-relaxed opacity-80 md:grid-cols-2 md:gap-10">
              <p>{t("limitsBody")}</p><p>{t("limitsExcluded")}</p>
            </div>
          </article>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={t("migrationTitle")} description={t("migrationBody")} />
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { icon: Download, title: t("migrationExportTitle"), body: t("migrationExportBody"), tone: CARD_TONES.lavender },
              { icon: Upload, title: t("migrationImportTitle"), body: t("migrationImportBody"), tone: CARD_TONES.sage },
            ].map(point => (
              <article key={point.title} className={cn("rounded-2xl p-6 sm:p-8", point.tone)}>
                <point.icon className="mb-5 size-6" strokeWidth={1.5} aria-hidden />
                <h3 className="text-2xl font-medium tracking-tight">{point.title}</h3>
                <p className="mt-4 text-sm leading-relaxed opacity-80">{point.body}</p>
              </article>
            ))}
          </div>
          <p className="mt-5 flex max-w-3xl items-start gap-3 text-sm leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />{t("migrationNote")}
          </p>
        </div>
      </section>

      <section className="px-4 pt-8 pb-20 sm:px-6 sm:pb-28">
        <div className={cn("mx-auto max-w-6xl rounded-2xl p-6 sm:p-10", CARD_TONES.sky)}>
          <h2 className="text-3xl leading-tight font-medium tracking-[-0.035em] sm:text-4xl">{t("operationsTitle")}</h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed opacity-80">{t("operationsSubtitle")}</p>
          <ul className="mt-10 grid gap-8 md:grid-cols-3">
            {OPERATIONS.map(point => (
              <li key={point.key}>
                <point.icon className="mb-4 size-5" strokeWidth={1.5} aria-hidden />
                <h3 className="text-lg font-medium tracking-tight">{t(`operation_${point.key}_title`)}</h3>
                <p className="mt-3 text-sm leading-relaxed opacity-80">{t(`operation_${point.key}_body`)}</p>
              </li>
            ))}
          </ul>
          <a href={`${releaseBase}/docs/self-hosting-operations.md`} target="_blank" rel="noopener noreferrer"
            className="mt-10 inline-flex min-h-11 items-center gap-3 rounded-full bg-background/70 px-5 py-3 text-sm font-medium transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current">
            {t("openOperationsGuide")}<ArrowRight className="size-4 shrink-0" aria-hidden />
          </a>
        </div>
      </section>
    </>
  );
}

import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowRight,
  Database,
  Globe2,
  HardDrive,
  Server,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import packageJson from "@/package.json";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { localizedHref } from "@/lib/locale-href";
import { MINDDY_REPOSITORY_URL } from "@/lib/site";
import { Github } from "@/components/git/provider-icons";
import { Reveal, RevealHeading } from "@/components/marketing/reveal";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "selfHosting", locale: (await getLocale()) as Locale });
}

export default async function SelfHostingPage() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("SelfHosting");
  const installHref = localizedHref("/self-hosting/install", locale);
  const releaseTag = `v${packageJson.version}`;
  const releaseBase = `${MINDDY_REPOSITORY_URL}/blob/${releaseTag}`;

  return (
    <>
      <section className="overflow-hidden px-4 pb-16 pt-24 sm:px-6 sm:pb-24 sm:pt-32">
        <div className="mx-auto grid w-full max-w-6xl items-end gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
          <div>
            <Reveal className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground">
              <Server className="h-3.5 w-3.5" aria-hidden />
              {t("eyebrow")}
            </Reveal>
            <RevealHeading
              as="h1"
              className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tighter text-balance sm:text-6xl"
              text={t("heroTitle")}
            />
            <Reveal as="p" delay={0.14} className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
              {t("heroSubtitle")}
            </Reveal>
            <Reveal delay={0.22} className="mt-7 flex flex-wrap gap-3">
              <a
                href={installHref}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t("heroCtaPrimary")}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
              <a
                href={MINDDY_REPOSITORY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                <Github className="h-4 w-4" aria-hidden />
                {t("repositoryCta")}
              </a>
            </Reveal>
          </div>

          <Reveal delay={0.18} className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
              {t("promiseTitle")}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("promiseBody")}</p>
            <ul className="mt-4 space-y-2 text-sm">
              {[t("promiseOne"), t("promiseTwo"), t("promiseThree")].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-primary">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="border-y border-border bg-muted/20 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto w-full max-w-6xl">
          <header className="max-w-2xl">
            <p className="text-sm font-medium text-primary">01</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("howTitle")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{t("howBody")}</p>
          </header>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { icon: Server, title: t("foundation_app_title"), body: t("foundation_app_body") },
              { icon: Database, title: t("foundation_supabase_title"), body: t("foundation_supabase_body") },
              { icon: HardDrive, title: t("foundation_data_title"), body: t("foundation_data_body") },
            ].map(({ icon: Icon, title, body }) => (
              <article key={title} className="rounded-2xl border border-border bg-card p-5">
                <Icon className="h-5 w-5 text-primary" aria-hidden />
                <h3 className="mt-4 font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{t("howBoundary")}</p>
        </div>
      </section>

      <section id="routes" className="scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto w-full max-w-6xl">
          <header className="max-w-2xl">
            <p className="text-sm font-medium text-primary">02</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("routesTitle")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{t("routesBody")}</p>
          </header>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {[
              {
                icon: HardDrive,
                title: t("localTitle"),
                body: t("localBody"),
                time: t("localTime"),
                facts: [t("localFactUsers"), t("localFactNetwork"), t("localFactMemory")],
                cta: t("routeCtaLocal"),
                query: "?route=local",
              },
              {
                icon: Globe2,
                title: t("teamTitle"),
                body: t("teamBody"),
                time: t("teamTime"),
                facts: [t("teamFactUsers"), t("teamFactNetwork"), t("teamFactMemory")],
                cta: t("routeCtaTeam"),
                query: "?route=team",
              },
            ].map(({ icon: Icon, title, body, time, facts, cta, query }) => (
              <article key={title} className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="rounded-full border border-primary/25 bg-primary/[0.05] px-2.5 py-1 text-xs font-medium text-primary">
                    {time}
                  </span>
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                <ul className="mt-5 grid gap-2 border-t border-border pt-5 text-sm sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  {facts.map((fact) => (
                    <li key={fact} className="flex items-center gap-2 text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                      {fact}
                    </li>
                  ))}
                </ul>
                <a href={`${installHref}${query}`} className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                  {cta}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/20 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
          <header>
            <p className="text-sm font-medium text-primary">03</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("migrationTitle")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("migrationBody")}</p>
          </header>
          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("migrationExportTitle")}</p>
              <p className="mt-3 text-sm leading-relaxed text-foreground">{t("migrationExportBody")}</p>
            </article>
            <article className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("migrationImportTitle")}</p>
              <p className="mt-3 text-sm leading-relaxed text-foreground">{t("migrationImportBody")}</p>
            </article>
            <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground md:col-span-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              {t("migrationNote")}
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto w-full max-w-6xl">
          <header className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("limitsTitle")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{t("limitsBody")}</p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t("limitsExcluded")}</p>
          </header>
        </div>
      </section>

      <section className="border-t border-border bg-muted/20 px-4 py-14 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Wrench className="h-4 w-4 text-primary" aria-hidden />
              {t("operationsTitle")}
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("operationsSubtitle")}</p>
          </div>
          <a
            href={`${releaseBase}/docs/self-hosting-operations.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-background"
          >
            {t("openOperationsGuide")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </section>
    </>
  );
}

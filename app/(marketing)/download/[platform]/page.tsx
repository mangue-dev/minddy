import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Download, ExternalLink, Smartphone } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { Github } from "@/components/git/provider-icons";
import type { Locale } from "@/i18n/config";
import { MINDDY_LICENSE_URL, MINDDY_REPOSITORY_URL } from "@/lib/brand-constants";
import {
  publicPathForLocale,
  routeByKey,
} from "@/lib/public-routes";
import { publicPageMetadata } from "@/lib/seo";
import { Reveal, RevealGroup, RevealHeading } from "@/components/marketing/reveal";
import { DownloadPlatformStructuredData } from "@/components/marketing/structured-data";

const PLATFORMS = {
  "mobile-pwa": {
    namespace: "DownloadMobile",
    routeKey: "downloadMobile",
    primaryHref: null,
    secondaryHref: "/signup",
    icon: Smartphone,
  },
} as const;

type Platform = keyof typeof PLATFORMS;

const PLATFORM_LINKS = [
  { platform: "mobile-pwa", labelKey: "platformGuideMobile" },
] as const satisfies ReadonlyArray<{ platform: Platform; labelKey: string }>;

function platformConfig(raw: string) {
  return raw in PLATFORMS ? PLATFORMS[raw as Platform] : null;
}

export function generateStaticParams() {
  return Object.keys(PLATFORMS).map((platform) => ({ platform }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ platform: string }>;
}): Promise<Metadata> {
  const config = platformConfig((await params).platform);
  if (!config) return {};
  return publicPageMetadata({
    routeKey: config.routeKey,
    locale: (await getLocale()) as Locale,
  });
}

export default async function DownloadPlatformPage({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const platform = (await params).platform;
  const config = platformConfig(platform);
  if (!config) notFound();

  const locale = (await getLocale()) as Locale;
  const [t, td] = await Promise.all([
    getTranslations(config.namespace),
    getTranslations("Download"),
  ]);
  const Icon = config.icon;
  const downloadHub = publicPathForLocale(routeByKey("download"), locale);
  const primaryHref =
    platform === "mobile-pwa" ? `${downloadHub}#mobile-install-guide` : config.primaryHref;

  return (
    <>
      <DownloadPlatformStructuredData routeKey={config.routeKey} />
      <section className="border-b border-border pt-24 pb-16 sm:pt-28 sm:pb-24">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <Reveal
              as="p"
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground"
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {t("eyebrow")}
            </Reveal>
            <RevealHeading
              as="h1"
              className="max-w-3xl text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-5xl"
              text={t("heroTitle")}
            />
            <Reveal
              as="p"
              delay={0.15}
              className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground"
            >
              {t("heroSubtitle")}
            </Reveal>
            <Reveal delay={0.24} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg">
                <a href={primaryHref ?? downloadHub}>
                  {platform === "mobile-pwa" ? (
                    <Smartphone data-icon="inline-start" />
                  ) : (
                    <Download data-icon="inline-start" />
                  )}
                  {t("primaryCta")}
                </a>
              </Button>
              {config.secondaryHref ? (
                <Button asChild size="lg" variant="outline">
                  <a href={config.secondaryHref}>{t("secondaryCta")}</a>
                </Button>
              ) : (
                <Button asChild size="lg" variant="outline">
                  <Link href={downloadHub}>{t("secondaryCta")}</Link>
                </Button>
              )}
            </Reveal>
          </div>

          <Reveal delay={0.08} className="rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-8">
            <Icon className="size-10 text-primary" aria-hidden="true" />
            <h2 className="mt-6 text-xl font-semibold tracking-tight">{t("availabilityTitle")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("availabilityBody")}
            </p>
          </Reveal>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <RevealHeading
            className="text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
            text={t("installTitle")}
          />
          <RevealGroup as="ol" step={0.08} className="mt-10 grid gap-4 md:grid-cols-3">
            {(["stepOne", "stepTwo", "stepThree"] as const).map((key, index) => (
              <li key={key} className="rounded-2xl border border-border bg-card p-6">
                <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
                  {index + 1}
                </span>
                <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{t(key)}</p>
              </li>
            ))}
          </RevealGroup>

          <Reveal delay={0.22} className="mt-10 rounded-2xl border border-border bg-muted/30 p-6 sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight">{t("noteTitle")}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {t("noteBody")}
            </p>
          </Reveal>
        </div>
      </section>

      <section className="border-y border-border bg-muted/20 py-16 sm:py-20">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 sm:px-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <RevealHeading
              className="text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
              text={t("openSourceTitle")}
            />
            <Reveal as="p" delay={0.12} className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
              {t("openSourceBody")}
            </Reveal>
          </div>
          <Reveal delay={0.18} className="flex flex-col gap-3 sm:flex-row md:flex-col">
            <Button asChild>
              <a href={MINDDY_REPOSITORY_URL} target="_blank" rel="noreferrer">
                <Github data-icon="inline-start" />
                GitHub
                <ExternalLink data-icon="inline-end" />
              </a>
            </Button>
            <Button asChild variant="outline">
              <a
                href={MINDDY_LICENSE_URL}
                target="_blank"
                rel="noreferrer"
              >
                GNU AGPL v3.0
              </a>
            </Button>
          </Reveal>
        </div>
      </section>

      <section aria-label={td("platformSelectorLabel")} className="py-14 sm:py-16">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <nav className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PLATFORM_LINKS.map((item) => {
              const route = routeByKey(PLATFORMS[item.platform].routeKey);
              const active = item.platform === platform;
              return (
                <Link
                  key={item.platform}
                  href={publicPathForLocale(route, locale)}
                  aria-current={active ? "page" : undefined}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50"
                >
                  {td(item.labelKey)}
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              );
            })}
          </nav>
        </div>
      </section>
    </>
  );
}

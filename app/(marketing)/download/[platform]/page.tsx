import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight, Check, ExternalLink, Globe, Smartphone, Tablet } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { Github } from "@/components/git/provider-icons";
import type { Locale } from "@/i18n/config";
import { MINDDY_LICENSE_URL, MINDDY_REPOSITORY_URL } from "@/lib/brand-constants";
import { publicPathForLocale, routeByKey } from "@/lib/public-routes";
import { publicPageMetadata } from "@/lib/seo";
import { CARD_TONES } from "@/components/marketing/card-tones";
import { MobilePwaGuideSteps } from "@/components/marketing/mobile-pwa-install-guide";
import { standaloneMobileInstallGuideCopy } from "@/components/marketing/mobile-install-guide-copy";
import { DownloadPlatformStructuredData } from "@/components/marketing/structured-data";

export function generateStaticParams() {
  return [{ platform: "mobile-pwa" }];
}

export async function generateMetadata({ params }: { params: Promise<{ platform: string }> }): Promise<Metadata> {
  if ((await params).platform !== "mobile-pwa") return {};
  return publicPageMetadata({ routeKey: "downloadMobile", locale: (await getLocale()) as Locale });
}

export default async function DownloadPlatformPage({ params }: { params: Promise<{ platform: string }> }) {
  if ((await params).platform !== "mobile-pwa") notFound();
  const locale = (await getLocale()) as Locale;
  const [t, td] = await Promise.all([getTranslations("DownloadMobile"), getTranslations("Download")]);
  const downloadHub = publicPathForLocale(routeByKey("download"), locale);
  const copy = standaloneMobileInstallGuideCopy(td, t);

  return (
    <>
      <DownloadPlatformStructuredData routeKey="downloadMobile" />
      <section className="px-4 pt-24 pb-10 sm:px-6 sm:pt-32 sm:pb-14">
        <div className="mx-auto max-w-6xl">
          <Link href={downloadHub} className="mb-7 inline-flex min-h-11 items-center gap-2 rounded-full text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <ArrowLeft className="size-4" aria-hidden />{t("allDownloads")}
          </Link>
          <h1 className="max-w-5xl text-[clamp(2.5rem,5.8vw,5rem)] leading-[1.06] font-medium tracking-[-0.055em] text-balance">{t("heroTitle")}</h1>
          <p className="mt-7 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">{t("heroSubtitle")}</p>
          <nav aria-label={t("installTitle")} className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-full"><a href="#ios-install"><Tablet data-icon="inline-start" />{td("iosGuideEyebrow")}<ArrowRight data-icon="inline-end" /></a></Button>
            <Button asChild size="lg" variant="outline" className="rounded-full"><a href="#android-install"><Smartphone data-icon="inline-start" />{td("androidGuideEyebrow")}<ArrowRight data-icon="inline-end" /></a></Button>
          </nav>
        </div>
      </section>

      <section className="px-4 pb-6 sm:px-6">
        <div className={`mx-auto flex max-w-6xl flex-col gap-6 rounded-2xl p-6 sm:p-8 md:flex-row md:items-center md:justify-between ${CARD_TONES.sage}`}>
          <div className="max-w-2xl">
            <h2 className="text-xl font-medium tracking-tight">{t("availabilityTitle")}</h2>
            <p className="mt-3 text-sm leading-relaxed opacity-80">{t("availabilityBody")}</p>
          </div>
          <Button asChild size="lg" className="w-fit shrink-0 rounded-full"><a href="/signup">{t("secondaryCta")}<ArrowRight data-icon="inline-end" /></a></Button>
        </div>
      </section>

      <MobilePwaGuideSteps platform="ios" copy={copy} locale={locale} id="ios-install" />
      <div className="bg-[#f4f6f9] dark:bg-[#12171d]">
        <MobilePwaGuideSteps platform="android" copy={copy} locale={locale} id="android-install" manualAndroid />
      </div>

      <section className="px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className={`rounded-2xl p-6 sm:p-8 ${CARD_TONES.peach}`}>
            <Check className="mb-5 size-6" strokeWidth={1.5} aria-hidden />
            <h2 className="text-3xl font-medium tracking-[-0.035em] sm:text-4xl">{t("finishTitle")}</h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed opacity-80">{t("finishBody")}</p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <article className={`rounded-2xl p-6 sm:p-8 ${CARD_TONES.sky}`}>
              <Globe className="mb-5 size-6" strokeWidth={1.5} aria-hidden />
              <h2 className="text-2xl font-medium tracking-tight">{t("noteTitle")}</h2>
              <p className="mt-3 text-sm leading-relaxed opacity-80">{t("noteBody")}</p>
            </article>
            <article className={`rounded-2xl p-6 sm:p-8 ${CARD_TONES.lavender}`}>
              <Github className="mb-5 size-6" aria-hidden />
              <h2 className="text-2xl font-medium tracking-tight">{t("openSourceTitle")}</h2>
              <p className="mt-3 text-sm leading-relaxed opacity-80">{t("openSourceBody")}</p>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
                {[[MINDDY_REPOSITORY_URL, "GitHub"], [MINDDY_LICENSE_URL, "GNU AGPL v3.0"]].map(([href, label]) => <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current">{label}<ExternalLink className="size-3.5" aria-hidden /></a>)}
              </div>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}

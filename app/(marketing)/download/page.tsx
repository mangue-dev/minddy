import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AppWindow, Bell, RefreshCw } from "lucide-react";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { publicPathForLocale, routeByKey } from "@/lib/public-routes";
import { desktopFeedBaseUrl, dmgEntry, formatBytes, linuxPackageEntry, parseLatestLinuxFeed, parseLatestMacFeed } from "@/lib/desktop/update-feed";
import { SectionCta } from "@/components/marketing/section-cta";
import { DownloadPlatformCards } from "@/components/marketing/download-platform-cards";
import { MobilePwaInstallGuide } from "@/components/marketing/mobile-pwa-install-guide";
import { mobileInstallGuideCopy } from "@/components/marketing/mobile-install-guide-copy";
import { CARD_TONES } from "@/components/marketing/card-tones";
import { SectionHeading } from "@/components/marketing/section-heading";
import { ScreenshotSlot } from "@/components/marketing/screenshot-slot";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "download", locale: (await getLocale()) as Locale });
}

const POINTS = [
  { key: "window", icon: AppWindow },
  { key: "notifications", icon: Bell },
  { key: "updates", icon: RefreshCw },
] as const;

/** Cached release metadata is optional: download actions stay available when feeds cannot be read. */
async function currentRelease(): Promise<{ version: string; sizes: Record<"arm64" | "x64", number | null> } | null> {
  const base = desktopFeedBaseUrl();
  if (!base) return null;
  const response = await fetch(`${base}/latest-mac.yml`, {
    next: { revalidate: 3600 },
  }).catch(() => null);
  if (!response?.ok) return null;
  const release = parseLatestMacFeed(await response.text());
  if (!release) return null;
  return { version: release.version, sizes: { arm64: dmgEntry(release, "arm64")?.size ?? null, x64: dmgEntry(release, "x64")?.size ?? null } };
}

async function currentLinuxRelease(): Promise<{ version: string; sizes: Record<"arm64" | "x64", number | null> } | null> {
  const base = desktopFeedBaseUrl();
  if (!base) return null;
  const response = await fetch(`${base}/latest-linux.yml`, {
    next: { revalidate: 3600 },
  }).catch(() => null);
  if (!response?.ok) return null;
  const release = parseLatestLinuxFeed(await response.text());
  if (!release) return null;
  return { version: release.version, sizes: { arm64: linuxPackageEntry(release, "AppImage", "arm64")?.size ?? null, x64: linuxPackageEntry(release, "AppImage", "x64")?.size ?? null } };
}

export default async function DownloadPage() {
  const locale = (await getLocale()) as Locale;
  const [t, release, linuxRelease] = await Promise.all([
    getTranslations("Download"), currentRelease(), currentLinuxRelease(),
  ]);
  const releaseLabel = (entry: typeof release, arch: "arm64" | "x64") => {
    if (!entry) return t("latestRelease");
    const size = entry.sizes[arch];
    return size ? `${entry.version} · ${formatBytes(size, locale)}` : entry.version;
  };


  return (
    <>
      <section className="px-4 pt-24 pb-12 sm:px-6 sm:pt-32 sm:pb-16">
        <div className="mx-auto max-w-6xl">
          <header className="mb-12 max-w-3xl sm:mb-16">
            <h1 className="text-[clamp(2.5rem,5.8vw,5rem)] leading-[1.06] font-medium tracking-[-0.055em] text-balance">{t("heroTitle")}</h1>
            <p className="mt-7 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">{t("heroSubtitle")}</p>
          </header>
          <DownloadPlatformCards
            copy={{
              download: t("cardDownload"), guide: t("cardGuide"), architecture: t("cardArchitecture"),
              macBody: t("cardMacBody"), windowsBody: t("cardWindowsBody"), linuxBody: t("cardLinuxBody"),
              iosBody: t("cardIosBody"), androidBody: t("cardAndroidBody"), iosTitle: t("iosGuideEyebrow"),
              androidInstall: t("downloadButtonAndroid"),
              windowsUpdates: t("cardWindowsUpdates"),
            }}
            macRelease={{ arm64: releaseLabel(release, "arm64"), x64: releaseLabel(release, "x64") }}
            linuxRelease={{ arm64: releaseLabel(linuxRelease, "arm64"), x64: releaseLabel(linuxRelease, "x64") }}
            mobileGuideHref={publicPathForLocale(routeByKey("downloadMobile"), locale)}
          />
        </div>
      </section>

      <MobilePwaInstallGuide copy={mobileInstallGuideCopy(t)} locale={locale} />

      <section className="px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={t("pointsTitle")} description={t("pointsSubtitle")} />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className={`flex items-center rounded-2xl p-4 sm:p-6 lg:col-span-2 ${CARD_TONES.sage}`}>
              <ScreenshotSlot id="heroBoard" expandable sizes="(min-width: 1024px) 710px, 100vw" className="w-full shadow-lg shadow-black/5" />
            </div>
            <div className={`rounded-2xl p-6 sm:p-8 ${CARD_TONES.butter}`}>
              <ul className="flex h-full flex-col justify-between gap-8">
                {POINTS.map(point => (
                  <li key={point.key}>
                    <point.icon className="mb-3 size-5" strokeWidth={1.5} aria-hidden />
                    <h3 className="text-lg font-medium tracking-tight">{t(`point_${point.key}_title`)}</h3>
                    <p className="mt-2 text-sm leading-relaxed opacity-80">{t(`point_${point.key}_body`)}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <article className={`rounded-2xl p-6 sm:p-8 ${CARD_TONES.sky}`}>
              <h3 className="text-xl font-medium tracking-tight">{t("noticeTitle")}</h3>
              <p className="mt-3 text-sm leading-relaxed opacity-80">{t("noticeBody")}</p>
            </article>
            <article className={`rounded-2xl p-6 sm:p-8 ${CARD_TONES.lavender}`}>
              <h3 className="text-xl font-medium tracking-tight">{t("noticeCounterTitle")}</h3>
              <p className="mt-3 text-sm leading-relaxed opacity-80">{t("noticeCounterBody")}</p>
            </article>
          </div>
        </div>
      </section>
      <SectionCta />
    </>
  );
}

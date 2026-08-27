import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import {
  desktopFeedBaseUrl,
  dmgEntry,
  formatBytes,
  linuxPackageEntry,
  parseLatestLinuxFeed,
  parseLatestMacFeed,
} from "@/lib/desktop/update-feed";
import { Reveal, RevealGroup, RevealHeading } from "@/components/marketing/reveal";
import { DesktopShowcase } from "@/components/marketing/desktop-showcase";
import { SectionCta } from "@/components/marketing/section-cta";
import { DownloadPlatformCta } from "@/components/marketing/download-platform-cta";
import {
  MobilePwaInstallGuide,
  type MobileInstallGuideCopy,
} from "@/components/marketing/mobile-pwa-install-guide";
import { IsoTile, type IsoTileName } from "@/components/marketing/iso-tile";

/**
 * `/download` — minddy desktop and mobile installation (MIN-292, MIN-418, MIN-473).
 *
 * **A PAGE and not a button on the landing**, because the platform differences
 * need an honest explanation that does not fit under a button. Closing the
 * window keeps the Windows and Linux app running in the background, while the
 * signed macOS app can receive APNs notifications even after it quits. This
 * belongs mid-page, at the same size as the control the user retains over it.
 *
 * **Numbers are READ, not written.** Version and weight come from
 * update manifests, with a cache time. A “~100 MB”
 * hard in `messages/*.json` would be false on the next publication, and
 * no one would think to correct it. Feed unreachable → the page falls on
 * generic values ​​and keeps its button: it never deprives itself of its only
 * useful action.
 *
 * The layout breaks from the other public pages, which are all
 * centered: here the hero is in TWO COLUMNS, text on the left, app on the right.
 * This is the only page on the site whose subject is an object — it must be shown,
 * rather than merely talked about.
 */

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "download", locale: (await getLocale()) as Locale });
}

/**
 * What the app provides, in the order you see it when using it.
 *
 * The icons are those of the landing — lying in the isometry of the app
 * (`IsoTile`), and not a lucid face in a rounded pellet. This page
 * was the last one on the site to bear the old design, the one that says nothing about
 * minddy; a name is enough here, the resolution is done in the register.
 */
const POINTS = [
  { key: "window", icon: "window" },
  { key: "notifications", icon: "bell" },
  { key: "updates", icon: "refresh" },
] as const satisfies ReadonlyArray<{ key: string; icon: IsoTileName }>;

/**
 * The version and weight of the `.dmg` Apple silicon, read in the feed.
 *
 * `revalidate` rather than `no-store`: the page remains served from the cache —
 * it's a public page, it needs to stay fast — and refreshes in
 * the hour following a publication. An error never comes up: a page of
 * download without its button would be worse than an outdated version number.
 */
async function currentRelease(): Promise<{ version: string; size: number | null } | null> {
  const base = desktopFeedBaseUrl();
  if (!base) return null;
  const response = await fetch(`${base}/latest-mac.yml`, {
    next: { revalidate: 3600 },
  }).catch(() => null);
  if (!response?.ok) return null;
  const release = parseLatestMacFeed(await response.text());
  if (!release) return null;
  return { version: release.version, size: dmgEntry(release, "arm64")?.size ?? null };
}

async function currentLinuxRelease(): Promise<{ version: string; size: number | null } | null> {
  const base = desktopFeedBaseUrl();
  if (!base) return null;
  const response = await fetch(`${base}/latest-linux.yml`, {
    next: { revalidate: 3600 },
  }).catch(() => null);
  if (!response?.ok) return null;
  const release = parseLatestLinuxFeed(await response.text());
  if (!release) return null;
  return { version: release.version, size: linuxPackageEntry(release, "AppImage", "x64")?.size ?? null };
}

export default async function DownloadPage() {
  const locale = (await getLocale()) as Locale;
  const [t, release, linuxRelease] = await Promise.all([
    getTranslations("Download"),
    currentRelease(),
    currentLinuxRelease(),
  ]);

  const specs = [
    {
      key: "version",
      label: t("specVersion"),
      value: release ? release.version : t("specVersionUnknown"),
    },
    {
      key: "size",
      label: t("specSize"),
      value: release?.size ? formatBytes(release.size, locale) : t("specSizeUnknown"),
    },
    { key: "os", label: t("specOs"), value: t("specOsValue") },
    { key: "signed", label: t("specSigned"), value: t("specSignedValue") },
  ];

  const mobileInstallGuideCopy = {
    iosEyebrow: t("iosGuideEyebrow"),
    iosTitle: t("iosGuideTitle"),
    iosBody: t("iosGuideBody"),
    iosStepShareTitle: t("iosStepShareTitle"),
    iosStepShareBody: t("iosStepShareBody"),
    iosStepHomeTitle: t("iosStepHomeTitle"),
    iosStepHomeBody: t("iosStepHomeBody"),
    iosStepAddTitle: t("iosStepAddTitle"),
    iosStepAddBody: t("iosStepAddBody"),
    androidEyebrow: t("androidGuideEyebrow"),
    androidTitle: t("androidGuideTitle"),
    androidBody: t("androidGuideBody"),
    androidStepPromptTitle: t("androidStepPromptTitle"),
    androidStepPromptBody: t("androidStepPromptBody"),
    androidStepMenuTitle: t("androidStepMenuTitle"),
    androidStepMenuBody: t("androidStepMenuBody"),
    uiShare: t("installUiShare"),
    uiAddToHome: t("installUiAddToHome"),
    uiOpenAsWebApp: t("installUiOpenAsWebApp"),
    uiAdd: t("installUiAdd"),
    uiCancel: t("installUiCancel"),
    uiInstallApp: t("installUiInstallApp"),
    uiInstall: t("installUiInstall"),
    uiNotNow: t("installUiNotNow"),
    uiCopy: t("installUiCopy"),
    uiSettings: t("installUiSettings"),
  } satisfies MobileInstallGuideCopy;

  return (
    <>
      {/* ── The download, and the object ────────────────────────────────── */}
      <section className="overflow-hidden pt-24 pb-16 sm:pt-28 sm:pb-24">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
            <div>
              <Reveal
                as="p"
                className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground"
              >
                {/* The Apple logo is not in lucid, and the pictogram of a
 third-party brand is drawn or not displayed. The word is enough. */}
                {t("eyebrow")}
              </Reveal>

              {/* `Reveal` and not `RevealHeading`: this cuts the word text
 to word, which prohibits styling PART of the title. Or
 the accent in italic serif — the only typographical fantasy
 of the site, carried by the hero of the landing — is what connects
 this page to the others. */}
              <Reveal
                as="h1"
                delay={0.06}
                className="text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-5xl"
              >
                {t("heroTitle")}{" "}
                <span className="font-serif font-normal italic">{t("heroTitleAccent")}</span>
              </Reveal>

              <Reveal
                as="p"
                delay={0.18}
                className="mt-5 max-w-md text-lg leading-relaxed text-pretty text-muted-foreground"
              >
                {t("heroSubtitle")}
              </Reveal>

              {/* The client-side CTA resolves the visitor's platform without
                  making this public page dynamic. Direct package links remain
                  real anchors, and Windows opens the native Store listing. */}
              <Reveal
                delay={0.26}
                className="mt-8 max-w-xl"
              >
                <DownloadPlatformCta
                  macLabel={t("downloadButtonMac")}
                  macIntelLabel={t("downloadIntel")}
                  linuxLabel={t("downloadButtonLinux")}
                  linuxArmLabel={t("linuxAppImageArm64")}
                  linuxBody={t("linuxBody")}
                  linuxReleaseLabel={
                    linuxRelease
                      ? t("linuxRelease", {
                          version: linuxRelease.version,
                          size: linuxRelease.size
                            ? formatBytes(linuxRelease.size, locale)
                            : t("specSizeUnknown"),
                        })
                      : t("linuxReleaseUnknown")
                  }
                  linuxPackagesLabel={t("linuxPackages")}
                  linuxDebX64Label={t("linuxDebX64")}
                  linuxRpmX64Label={t("linuxRpmX64")}
                  linuxDebArm64Label={t("linuxDebArm64")}
                  linuxRpmArm64Label={t("linuxRpmArm64")}
                  windowsLabel={t("downloadButtonWindows")}
                  windowsBody={t("windowsBody")}
                  androidLabel={t("downloadButtonAndroid")}
                  iosLabel={t("downloadButtonIos")}
                  tutorialLabel={t("showTutorial")}
                  selectorLabel={t("platformSelectorLabel")}
                />
              </Reveal>

              <Reveal as="p" delay={0.32} className="mt-4 text-xs text-muted-foreground">
                {t("requirements")}
              </Reveal>

            </div>

            {/* `-mr-6`: the composition bites on the right margin in wide screen.
 This is what takes it out of the grid and gives it its scale. */}
            <Reveal delay={0.1} className="lg:-mr-14">
              <DesktopShowcase />
            </Reveal>
          </div>
        </div>
      </section>

      <MobilePwaInstallGuide copy={mobileInstallGuideCopy} locale={locale} />

      {/* ── The facts ──────────────────────────── ────────────────────────────
 A strip of four boxes separated by one-pixel lines, in the
 taste of a technical sheet: the label in small above, the value
 below. Two of the four are READ in the stream, so always
 true. `gap-px` on a `bg-border` background draws the nets without a single
 border to manage at the junctions. */}
      <section className="border-y border-border">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <RevealGroup
            as="dl"
            step={0.05}
            className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4"
          >
            {specs.map((spec) => (
              <div key={spec.key} className="bg-background px-5 py-6 sm:px-6 sm:py-7">
                <dt className="text-xs font-medium tracking-wide text-muted-foreground/80">
                  {spec.label}
                </dt>
                <dd className="mt-1.5 text-sm font-medium text-foreground">{spec.value}</dd>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── Ce que l'app ajoute ──────────────────────────────────────────── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <header className="mb-12 max-w-2xl">
            <RevealHeading
              className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
              text={t("pointsTitle")}
            />
            <Reveal
              as="p"
              delay={0.15}
              className="leading-relaxed text-pretty text-muted-foreground"
            >
              {t("pointsSubtitle")}
            </Reveal>
          </header>

          <RevealGroup as="ul" step={0.08} className="grid gap-10 sm:grid-cols-3">
            {POINTS.map((point) => (
              /* A net above each column, and nothing around: three
 traits that respond to the fact strip without repeating it in
 cards. Three more bordered cards would have made the page
 a grid of boxes. */
              <li key={point.key} className="border-t border-border pt-6">
                <IsoTile name={point.icon} className="mb-4 w-14" />
                <h3 className="mb-2 text-base font-medium">{t(`point_${point.key}_title`)}</h3>
                <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                  {t(`point_${point.key}_body`)}
                </p>
              </li>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── Background notifications, and their controls ─────────────────── */}
      <section className="border-t border-border bg-muted/20 py-16 sm:py-24">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <div className="grid gap-px overflow-hidden rounded-2xl bg-border ring-1 ring-border md:grid-cols-2">
            <Reveal className="bg-background p-6 sm:p-8">
              <h2 className="mb-2.5 font-medium">{t("noticeTitle")}</h2>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                {t("noticeBody")}
              </p>
            </Reveal>
            <Reveal delay={0.1} className="bg-background p-6 sm:p-8">
              <h2 className="mb-2.5 font-medium">{t("noticeCounterTitle")}</h2>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                {t("noticeCounterBody")}
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <SectionCta />
    </>
  );
}

import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
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
import { TrackedDownloadLink } from "@/components/marketing/tracked-download-link";
import { IsoTile, type IsoTileName } from "@/components/marketing/iso-tile";

/**
 * `/download` — minddy desktop applications (MIN-292, MIN-418).
 *
 * **A PAGE and not a button on the landing**, because there is something here
 * honest thing to say that doesn't fit under a button: app left, no more
 * notification. Electron does not support the Chromium push service (§3 of
 * framing), while the site and the installed web app even sound closed. THE
 * silence would be the only dishonesty of the site; write it in small letters under a button
 * would amount to the same — hence its place, mid-page, at the same size as the
 * reassurance that faces him.
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

              {/* A `<a>` and not a `<Link>`: the target is not a page but
 a redirection to a one hundred and twenty megabyte file. A
 route preload would make no sense. */}
              <Reveal
                delay={0.26}
                className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3"
              >
                <Button asChild size="lg">
                  <TrackedDownloadLink platform="macos" format="dmg" arch="arm64" href="/api/desktop/download">
                    <Download data-icon="inline-start" />
                    {t("downloadButton")}
                  </TrackedDownloadLink>
                </Button>
                <TrackedDownloadLink
                  platform="macos"
                  format="dmg"
                  arch="x64"
                  href="/api/desktop/download?arch=x64"
                  className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  {t("downloadIntel")}
                </TrackedDownloadLink>
              </Reveal>

              <Reveal as="p" delay={0.32} className="mt-4 text-xs text-muted-foreground">
                {t("requirements")}
              </Reveal>

              {/* macOS remains the primary hero, while the Linux AppImage is
 placed directly beside it. Visitors on every platform can immediately see
 which native download applies and retain a browser fallback. */}
              <Reveal as="p" delay={0.36} className="mt-1.5 text-xs text-muted-foreground">
                {t("platformNote")}
              </Reveal>

              <Reveal delay={0.42} className="mt-7 max-w-md rounded-xl border bg-muted/20 p-4">
                <p className="text-sm font-medium">{t("linuxTitle")}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {t("linuxBody")}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <TrackedDownloadLink
                    platform="linux"
                    format="AppImage"
                    arch="x64"
                    href="/api/desktop/download?platform=linux&format=AppImage&arch=x64"
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {t("linuxAppImageX64")}
                  </TrackedDownloadLink>
                  <TrackedDownloadLink
                    platform="linux"
                    format="AppImage"
                    arch="arm64"
                    href="/api/desktop/download?platform=linux&format=AppImage&arch=arm64"
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {t("linuxAppImageArm64")}
                  </TrackedDownloadLink>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {linuxRelease
                    ? t("linuxRelease", {
                        version: linuxRelease.version,
                        size: linuxRelease.size ? formatBytes(linuxRelease.size, locale) : t("specSizeUnknown"),
                      })
                    : t("linuxReleaseUnknown")}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">{t("linuxPackages")}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <TrackedDownloadLink
                    platform="linux"
                    format="deb"
                    arch="x64"
                    href="/api/desktop/download?platform=linux&format=deb&arch=x64"
                    className="underline-offset-4 hover:underline"
                  >
                    {t("linuxDebX64")}
                  </TrackedDownloadLink>
                  <TrackedDownloadLink
                    platform="linux"
                    format="rpm"
                    arch="x64"
                    href="/api/desktop/download?platform=linux&format=rpm&arch=x64"
                    className="underline-offset-4 hover:underline"
                  >
                    {t("linuxRpmX64")}
                  </TrackedDownloadLink>
                  <TrackedDownloadLink
                    platform="linux"
                    format="deb"
                    arch="arm64"
                    href="/api/desktop/download?platform=linux&format=deb&arch=arm64"
                    className="underline-offset-4 hover:underline"
                  >
                    {t("linuxDebArm64")}
                  </TrackedDownloadLink>
                  <TrackedDownloadLink
                    platform="linux"
                    format="rpm"
                    arch="arm64"
                    href="/api/desktop/download?platform=linux&format=rpm&arch=arm64"
                    className="underline-offset-4 hover:underline"
                  >
                    {t("linuxRpmArm64")}
                  </TrackedDownloadLink>
                </div>
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

      {/* ── Renunciation, and its counterpart ───────────────────────────────
 first. The opposite — the good news in big, the bad news in footnote — is exactly the layout that makes you not want to read. */}
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

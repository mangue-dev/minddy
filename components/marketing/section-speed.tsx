import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { localizedHref } from "@/lib/locale-href";
import { cn } from "@/lib/utils";
import { CARD_TONES, SOFT_TONES } from "./card-tones";
import { PlatformLogo } from "./download-platform-cards";
import { Reveal, RevealGroup, RevealHeading } from "./reveal";

/**
 * Times measured on the desktop app and on the web, on a project with 636
 * issues (MIN-683, October 2026). Rounded up from the slower of the two.
 */
const TIMINGS = [
  { key: "switch", ms: 60, tone: CARD_TONES.sky },
  { key: "issue", ms: 85, tone: CARD_TONES.lavender },
  { key: "back", ms: 90, tone: CARD_TONES.mint },
] as const;

const PLATFORMS = [
  { id: "macos", name: "macOS", tone: SOFT_TONES.sky },
  { id: "windows", name: "Windows", tone: SOFT_TONES.lavender },
  { id: "linux", name: "Linux", tone: SOFT_TONES.sage },
  { id: "ios", name: "iPhone", tone: SOFT_TONES.rose },
  { id: "android", name: "Android", tone: SOFT_TONES.peach },
] as const;

/** Speed: measured response times, then the platforms minddy runs on. */
export async function SectionSpeed() {
  const [t, locale] = await Promise.all([getTranslations("Landing"), getLocale() as Promise<Locale>]);
  return (
    <section id="speed" aria-labelledby="speed-title" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <header className="max-w-3xl">
          <Reveal as="p" className="text-sm font-medium text-primary">
            {t("speedEyebrow")}
          </Reveal>
          <span id="speed-title" className="contents">
            <RevealHeading
              text={t("speedHeadline")}
              className="mt-3 text-3xl leading-tight font-medium tracking-[-0.035em] text-balance sm:text-5xl"
            />
          </span>
          <Reveal
            as="p"
            delay={0.1}
            className="mt-5 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg"
          >
            {t("speedLede")}
          </Reveal>
        </header>

        <RevealGroup as="dl" className="mt-12 grid gap-4 sm:grid-cols-3">
          {TIMINGS.map(({ key, ms, tone }) => (
            <div key={key} className={cn("flex flex-col-reverse rounded-2xl p-6", tone)}>
              <dt className="mt-2 text-sm opacity-80">{t(`speed_${key}`)}</dt>
              <dd className="text-5xl font-medium tracking-[-0.04em] tabular-nums">
                {t("speedMs", { ms })}
              </dd>
            </div>
          ))}
        </RevealGroup>
        <p className="mt-4 text-xs text-muted-foreground">{t("speedNote")}</p>

        <h3 className="mt-14 text-base font-medium tracking-tight">{t("speedPlatforms")}</h3>
        <RevealGroup as="ul" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {PLATFORMS.map(({ id, name, tone }) => (
            <li key={id}>
              <a
                href={localizedHref(`/download#${id}`, locale)}
                className={cn(
                  "flex h-full flex-col items-start gap-6 rounded-2xl p-5 transition-[filter] hover:brightness-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:hover:brightness-125",
                  tone,
                )}
              >
                <span className="size-7">
                  <PlatformLogo platform={id} />
                </span>
                <span className="text-sm font-medium">{name}</span>
              </a>
            </li>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

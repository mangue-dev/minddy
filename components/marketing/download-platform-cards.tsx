"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowDownToLine, ArrowUpRight } from "lucide-react";
import { resolveInstallPlatform, WINDOWS_STORE_DEEP_LINK, type InstallPlatform } from "@/lib/desktop/install-prompt";
import { showMobileInstallGuide } from "@/lib/mobile-install-guide";
import { TrackedDownloadLink } from "./tracked-download-link";
import { usePwaInstall } from "./use-pwa-install";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "mangue-ui/components/ui/select";
import { CARD_TONES } from "./card-tones";

type SupportedInstallPlatform = Exclude<InstallPlatform, "unsupported">;
type Arch = "arm64" | "x64";
type NavigatorWithUserAgentData = Navigator & { userAgentData?: { platform?: string } };

export interface DownloadPlatformCardsProps {
  copy: {
    download: string;
    guide: string;
    architecture: string;
    macBody: string;
    windowsBody: string;
    windowsUpdates: string;
    linuxBody: string;
    iosBody: string;
    androidBody: string;
    iosTitle: string;
    androidInstall: string;
  };
  macRelease: Record<Arch, string>;
  linuxRelease: Record<Arch, string>;
  mobileGuideHref: string;
}

const ACTION = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-background transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current";
const TEXT_LINK = "inline-flex min-h-10 items-center gap-2 text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current";

function PlatformCard({ platform, title, body, tone, children, featured }: {
  platform: SupportedInstallPlatform;
  title: string;
  body: string;
  tone: string;
  children: ReactNode;
  featured: boolean;
}) {
  return (
    <article data-platform={platform} data-featured={featured || undefined}
      className={`min-w-0 rounded-2xl p-6 sm:p-8 ${featured ? "flex min-h-[420px] flex-col gap-8 md:col-span-2 md:min-h-[380px] md:flex-row md:items-center md:justify-between md:p-10" : "flex min-h-[340px] flex-col"} ${tone}`}>
      <div className={featured ? "min-w-0 md:max-w-lg" : ""}>
        <span className={`mb-7 block shrink-0 ${featured ? "size-16" : "size-10"}`}><PlatformLogo platform={platform} /></span>
        <h2 className={`font-medium tracking-[-0.035em] ${featured ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"}`}>{title}</h2>
        <p className={`mt-3 max-w-sm leading-relaxed opacity-80 ${featured ? "text-base" : "text-sm"}`}>{body}</p>
      </div>
      <div className={featured ? "mt-auto w-full md:my-auto md:max-w-sm md:shrink-0" : "mt-auto pt-8"}>{children}</div>
    </article>
  );
}

function Architecture({ platform, label, value, onChange }: {
  platform: "macos" | "linux";
  label: string;
  value: Arch;
  onChange: (value: Arch) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="opacity-80">{label}</span>
      <Select value={value} onValueChange={value => onChange(value as Arch)}>
        <SelectTrigger aria-label={`${label} — ${platform === "macos" ? "macOS" : "Linux"}`}
          className="min-h-10 w-auto min-w-28 border-current/20 bg-white/30 text-inherit dark:bg-black/15">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="arm64">{platform === "macos" ? "Apple silicon" : "ARM64"}</SelectItem>
          <SelectItem value="x64">{platform === "macos" ? "Intel" : "x64"}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/** Every platform stays visible; choosing an architecture only changes its package links. */
export function DownloadPlatformCards({ copy, macRelease, linuxRelease, mobileGuideHref }: DownloadPlatformCardsProps) {
  const [macArch, setMacArch] = useState<Arch>("arm64");
  const [linuxArch, setLinuxArch] = useState<Arch>("x64");
  const [platform, setPlatform] = useState<InstallPlatform>("unsupported");
  const { canPrompt, promptInstall } = usePwaInstall();
  useEffect(() => {
    setPlatform(resolveInstallPlatform({
      uaDataPlatform: (navigator as NavigatorWithUserAgentData).userAgentData?.platform,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
    }));
  }, []);

  const cards = [
    { platform: "macos", title: "macOS", body: copy.macBody, tone: CARD_TONES.sky },
    { platform: "windows", title: "Windows", body: copy.windowsBody, tone: CARD_TONES.lavender },
    { platform: "linux", title: "Linux", body: copy.linuxBody, tone: CARD_TONES.sage },
    { platform: "ios", title: copy.iosTitle, body: copy.iosBody, tone: CARD_TONES.rose },
    { platform: "android", title: "Android", body: copy.androidBody, tone: CARD_TONES.peach },
  ] as const;
  const ordered = [...cards.filter(card => card.platform === platform), ...cards.filter(card => card.platform !== platform)];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {ordered.map(card => (
        <PlatformCard key={card.platform} {...card} featured={card.platform === platform}>
          {card.platform === "macos" ? <>
          <Architecture platform="macos" label={copy.architecture} value={macArch} onChange={setMacArch} />
          <TrackedDownloadLink platform="macos" format="dmg" arch={macArch}
            href={macArch === "arm64" ? "/api/desktop/download" : "/api/desktop/download?arch=x64"} className={`${ACTION} w-full`}>
            <ArrowDownToLine className="size-4" aria-hidden />{copy.download} <span className="opacity-60">.dmg</span>
          </TrackedDownloadLink>
          <p className="mt-3 text-xs opacity-70">{macRelease[macArch]}</p>
          </> : card.platform === "windows" ? <>
          <a href={WINDOWS_STORE_DEEP_LINK} className={`${ACTION} w-full`}>Microsoft Store<ArrowUpRight className="size-4" aria-hidden /></a>
          <p className="mt-3 text-xs opacity-70">{copy.windowsUpdates}</p>
          </> : card.platform === "linux" ? <>
          <Architecture platform="linux" label={copy.architecture} value={linuxArch} onChange={setLinuxArch} />
          <TrackedDownloadLink platform="linux" format="AppImage" arch={linuxArch}
            href={`/api/desktop/download?platform=linux&format=AppImage&arch=${linuxArch}`} className={`${ACTION} w-full`}>
            <ArrowDownToLine className="size-4" aria-hidden />{copy.download} <span className="opacity-60">AppImage</span>
          </TrackedDownloadLink>
          <p className="mt-3 text-xs opacity-70">{linuxRelease[linuxArch]}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3">
            <span className="flex gap-3">
              {(["deb", "rpm"] as const).map(format => (
                <TrackedDownloadLink key={format} platform="linux" format={format} arch={linuxArch}
                  href={`/api/desktop/download?platform=linux&format=${format}&arch=${linuxArch}`} aria-label={`${copy.download} .${format} (${linuxArch})`} className={TEXT_LINK}>.{format}</TrackedDownloadLink>
              ))}
            </span>
          </div>
          </> : card.platform === "android" && platform === "android" && canPrompt ? (
            <button type="button" className={ACTION} onClick={() => void promptInstall()}>{copy.androidInstall}<ArrowDownToLine className="size-4" aria-hidden /></button>
          ) : (
            <a href={mobileGuideHref} className={TEXT_LINK} onClick={event => { event.preventDefault(); showMobileInstallGuide(card.platform as "ios" | "android"); }}>
              {copy.guide}<ArrowUpRight className="size-4" aria-hidden />
            </a>
          )}
        </PlatformCard>
      ))}
    </div>
  );
}

function PlatformLogo({ platform }: { platform: SupportedInstallPlatform }) {
  if (platform === "windows") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
        <path d="M1 1h10v10H1zM13 1h10v10H13zM1 13h10v10H1zM13 13h10v10H13z" />
      </svg>
    );
  }

  if (platform === "linux") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M12 2.2c-2.6 0-3.2 2.3-3 4.4.1 1.3-.2 2.1-1.1 3.4-1.4 1.8-2.5 3.9-2 5.6-.7.5-1.4 1-1.6 1.8-.2.9.5 1.3 1.5 1.6 1.5.4 2.3 1.4 3.6 1.1.8-.2 1.4-.7 1.8-1.2.7.2 1.3.2 1.9 0 .5.7 1.2 1.2 2 1.2 1.3 0 2.1-1.2 3.2-1.7.8-.4 1.6-.8 1.5-1.7-.1-.7-.8-1.3-1.5-1.8.4-1.7-.7-3.7-2-5.3-.9-1.2-1.3-2-1.2-3.4.1-2.1-.6-4.2-3.1-4.2Zm-1.1 3.1c.4 0 .7.5.7 1s-.3 1-.7 1-.7-.5-.7-1 .3-1 .7-1Zm2.2 0c.4 0 .7.5.7 1s-.3 1-.7 1-.7-.5-.7-1 .3-1 .7-1Zm-1.1 2c.8 0 1.6.4 1.6.9 0 .4-.8 1.1-1.6 1.1s-1.6-.7-1.6-1.1c0-.5.8-.9 1.6-.9Z"
        />
      </svg>
    );
  }

  if (platform === "android") {
    return (
      <svg aria-hidden="true" viewBox="64 64 896 896">
        <path fill="currentColor" d="M270.1 741.7c0 23.4 19.1 42.5 42.6 42.5h48.7v120.4c0 30.5 24.5 55.4 54.6 55.4s54.6-24.8 54.6-55.4V784.1h85v120.4c0 30.5 24.5 55.4 54.6 55.4s54.6-24.8 54.6-55.4V784.1h48.7c23.5 0 42.6-19.1 42.6-42.5V346.4h-486v395.3Zm357.1-600.1 44.9-65c2.6-3.8 2-8.9-1.5-11.4-3.5-2.4-8.5-1.2-11.1 2.6l-46.6 67.6a278.3 278.3 0 0 0-201.6 0l-46.6-67.5c-2.6-3.8-7.6-5.1-11.1-2.6-3.5 2.4-4.1 7.4-1.5 11.4l44.9 65c-71.4 33.2-121.4 96.1-127.8 169.6h486c-6.6-73.6-56.7-136.5-128-169.7ZM409.5 244.1a26.9 26.9 0 1 1 0-53.8 26.9 26.9 0 0 1 0 53.8Zm208.4 0a26.9 26.9 0 1 1 0-53.8 26.9 26.9 0 0 1 0 53.8Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="64 64 896 896">
      <path fill="currentColor" d="M747.4 535.7c-.4-68.2 30.5-119.6 92.9-157.5-34.9-50-87.7-77.5-157.3-82.8-65.9-5.2-138 38.4-164.4 38.4-27.9 0-91.7-36.6-141.9-36.6C273.1 298.8 163 379.8 163 544.6c0 48.7 8.9 99 26.7 150.8 23.8 68.2 109.6 235.3 199.1 232.6 46.8-1.1 79.9-33.2 140.8-33.2 59.1 0 89.7 33.2 141.9 33.2 90.3-1.3 167.9-153.2 190.5-221.6-121.1-57.1-114.6-167.2-114.6-170.7Zm-105.1-305c50.7-60.2 46.1-115 44.6-134.7-44.8 2.6-96.6 30.5-126.1 64.8-32.5 36.8-51.6 82.3-47.5 133.6 48.4 3.7 92.6-21.2 129-63.7Z" />
    </svg>
  );
}

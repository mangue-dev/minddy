"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Download, Smartphone } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import {
  resolveInstallPlatform,
  WINDOWS_STORE_DEEP_LINK,
  type InstallPlatform,
} from "@/lib/desktop/install-prompt";
import { showMobileInstallGuide } from "@/lib/mobile-install-guide";
import { TrackedDownloadLink } from "./tracked-download-link";
import { usePwaInstall } from "./use-pwa-install";

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: { platform?: string };
};

type SupportedInstallPlatform = Exclude<InstallPlatform, "unsupported">;

const PLATFORMS = [
  "windows",
  "macos",
  "linux",
  "android",
  "ios",
] as const satisfies readonly SupportedInstallPlatform[];

const PLATFORM_NAMES: Record<SupportedInstallPlatform, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  android: "Android",
  ios: "iOS",
};

function PlatformLogo({ platform }: { platform: SupportedInstallPlatform }) {
  if (platform === "windows") {
    return (
      <svg aria-hidden="true" viewBox="64 64 896 896">
        <path fill="currentColor" d="M523.8 191.4v288.9h382V128.1zm0 642.2 382 62.2v-352h-382zM120.1 480.2H443V201.9l-322.9 53.5zm0 290.4L443 823.2V543.8H120.1z" />
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

function PrimaryAction({ children }: { children: ReactNode }) {
  return <div className="flex min-h-10 flex-wrap items-center gap-x-5 gap-y-3">{children}</div>;
}

export interface DownloadPlatformCtaProps {
  macLabel: string;
  macIntelLabel: string;
  linuxLabel: string;
  linuxArmLabel: string;
  linuxBody: string;
  linuxReleaseLabel: string;
  linuxPackagesLabel: string;
  linuxDebX64Label: string;
  linuxRpmX64Label: string;
  linuxDebArm64Label: string;
  linuxRpmArm64Label: string;
  windowsLabel: string;
  windowsBody: string;
  androidLabel: string;
  iosLabel: string;
  tutorialLabel: string;
  selectorLabel: string;
}

export function DownloadPlatformCta({
  macLabel,
  macIntelLabel,
  linuxLabel,
  linuxArmLabel,
  linuxBody,
  linuxReleaseLabel,
  linuxPackagesLabel,
  linuxDebX64Label,
  linuxRpmX64Label,
  linuxDebArm64Label,
  linuxRpmArm64Label,
  windowsLabel,
  windowsBody,
  androidLabel,
  iosLabel,
  tutorialLabel,
  selectorLabel,
}: DownloadPlatformCtaProps) {
  const [platform, setPlatform] = useState<SupportedInstallPlatform>("macos");
  const { canPrompt, promptInstall } = usePwaInstall();

  useEffect(() => {
    const detected = resolveInstallPlatform({
      uaDataPlatform: (navigator as NavigatorWithUserAgentData).userAgentData?.platform,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
    });
    setPlatform(detected === "unsupported" ? "macos" : detected);
  }, []);

  let action: ReactNode;
  let details: ReactNode = null;

  if (platform === "android" || platform === "ios") {
    action = canPrompt ? (
      <Button size="lg" onClick={() => void promptInstall()}>
        <Smartphone data-icon="inline-start" />
        {platform === "android" ? androidLabel : iosLabel}
      </Button>
    ) : (
      <Button asChild size="lg" variant="outline">
        <a href="#mobile-install-guide" onClick={() => showMobileInstallGuide(platform)}>
          {tutorialLabel}
        </a>
      </Button>
    );
  } else if (platform === "windows") {
    action = (
      <Button asChild size="lg">
        <a href={WINDOWS_STORE_DEEP_LINK}>
          <Download data-icon="inline-start" />
          {windowsLabel}
        </a>
      </Button>
    );
    details = (
      <p className="mt-4 max-w-lg text-xs leading-relaxed text-muted-foreground">
        {windowsBody}
      </p>
    );
  } else if (platform === "linux") {
    action = (
      <>
        <Button asChild size="lg">
          <TrackedDownloadLink
            platform="linux"
            format="AppImage"
            arch="x64"
            href="/api/desktop/download?platform=linux&format=AppImage&arch=x64"
          >
            <Download data-icon="inline-start" />
            {linuxLabel}
          </TrackedDownloadLink>
        </Button>
        <TrackedDownloadLink
          platform="linux"
          format="AppImage"
          arch="arm64"
          href="/api/desktop/download?platform=linux&format=AppImage&arch=arm64"
          className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          {linuxArmLabel}
        </TrackedDownloadLink>
      </>
    );
    details = (
      <div className="mt-4 max-w-lg text-xs leading-relaxed text-muted-foreground">
        <p>{linuxBody}</p>
        <p className="mt-2">{linuxReleaseLabel}</p>
        <p className="mt-2">{linuxPackagesLabel}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          <TrackedDownloadLink
            platform="linux"
            format="deb"
            arch="x64"
            href="/api/desktop/download?platform=linux&format=deb&arch=x64"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {linuxDebX64Label}
          </TrackedDownloadLink>
          <TrackedDownloadLink
            platform="linux"
            format="rpm"
            arch="x64"
            href="/api/desktop/download?platform=linux&format=rpm&arch=x64"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {linuxRpmX64Label}
          </TrackedDownloadLink>
          <TrackedDownloadLink
            platform="linux"
            format="deb"
            arch="arm64"
            href="/api/desktop/download?platform=linux&format=deb&arch=arm64"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {linuxDebArm64Label}
          </TrackedDownloadLink>
          <TrackedDownloadLink
            platform="linux"
            format="rpm"
            arch="arm64"
            href="/api/desktop/download?platform=linux&format=rpm&arch=arm64"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {linuxRpmArm64Label}
          </TrackedDownloadLink>
        </div>
      </div>
    );
  } else {
    action = (
      <>
        <Button asChild size="lg">
          <TrackedDownloadLink
            platform="macos"
            format="dmg"
            arch="arm64"
            href="/api/desktop/download"
          >
            <Download data-icon="inline-start" />
            {macLabel}
          </TrackedDownloadLink>
        </Button>
        <TrackedDownloadLink
          platform="macos"
          format="dmg"
          arch="x64"
          href="/api/desktop/download?arch=x64"
          className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          {macIntelLabel}
        </TrackedDownloadLink>
      </>
    );
  }

  return (
    <div className="w-full">
      <PrimaryAction>{action}</PrimaryAction>
      {details}
      <div className="mt-6 border-t border-border pt-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{selectorLabel}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={selectorLabel}>
          {PLATFORMS.map((candidate) => {
            const selected = candidate === platform;
            return (
              <Button
                key={candidate}
                type="button"
                size="sm"
                variant={selected ? "default" : "outline"}
                aria-pressed={selected}
                data-platform={candidate}
                onClick={() => setPlatform(candidate)}
              >
                <PlatformLogo platform={candidate} />
                {PLATFORM_NAMES[candidate]}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

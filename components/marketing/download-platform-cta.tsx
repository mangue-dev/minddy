"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import {
  resolveInstallPlatform,
  WINDOWS_STORE_DEEP_LINK,
  type InstallPlatform,
} from "@/lib/desktop/install-prompt";
import { TrackedDownloadLink } from "./tracked-download-link";
import { usePwaInstall } from "./use-pwa-install";

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: { platform?: string };
};

export function DownloadPlatformCta({
  macLabel,
  macIntelLabel,
  linuxLabel,
  linuxArmLabel,
  windowsLabel,
  androidLabel,
  iosLabel,
}: {
  macLabel: string;
  macIntelLabel: string;
  linuxLabel: string;
  linuxArmLabel: string;
  windowsLabel: string;
  androidLabel: string;
  iosLabel: string;
}) {
  const [platform, setPlatform] = useState<InstallPlatform>("macos");
  const { canPrompt, promptInstall } = usePwaInstall();

  useEffect(() => {
    setPlatform(
      resolveInstallPlatform({
        uaDataPlatform: (navigator as NavigatorWithUserAgentData).userAgentData?.platform,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
      }),
    );
  }, []);

  if (platform === "android") {
    if (canPrompt) {
      return (
        <Button size="lg" onClick={() => void promptInstall()}>
          <Smartphone data-icon="inline-start" />
          {androidLabel}
        </Button>
      );
    }

    return (
      <Button asChild size="lg">
        <a href="#mobile-install-guide">
          <Smartphone data-icon="inline-start" />
          {androidLabel}
        </a>
      </Button>
    );
  }

  if (platform === "ios") {
    return (
      <Button asChild size="lg">
        <a href="#mobile-install-guide">
          <Smartphone data-icon="inline-start" />
          {iosLabel}
        </a>
      </Button>
    );
  }

  if (platform === "windows") {
    return (
      <Button asChild size="lg">
        <a href={WINDOWS_STORE_DEEP_LINK}>
          <Download data-icon="inline-start" />
          {windowsLabel}
        </a>
      </Button>
    );
  }

  if (platform === "linux") {
    return (
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
  }

  return (
    <>
      <Button asChild size="lg">
        <TrackedDownloadLink platform="macos" format="dmg" arch="arm64" href="/api/desktop/download">
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

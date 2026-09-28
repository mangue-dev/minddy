"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Download01Icon, SmartPhone01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { Button } from "mangue-ui/components/ui/button";
import {
  resolveInstallPlatform,
  WINDOWS_STORE_DEEP_LINK,
  type InstallPlatform,
} from "@/lib/desktop/install-prompt";
import { TrackedCta } from "./tracked-cta";
import { usePwaInstall } from "./use-pwa-install";

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: { platform?: string };
};

export function HeroPlatformCta({
  downloadHref,
  macLabel,
  linuxLabel,
  windowsLabel,
  androidLabel,
  iosLabel,
  browserLabel,
}: {
  downloadHref: string;
  macLabel: string;
  linuxLabel: string;
  windowsLabel: string;
  androidLabel: string;
  iosLabel: string;
  browserLabel: string;
}) {
  const [platform, setPlatform] = useState<InstallPlatform>("unsupported");
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
          <HugeiconsIcon icon={SmartPhone01Icon} data-icon="inline-start" />
          {androidLabel}
        </Button>
      );
    }

    return (
      <Button asChild size="lg">
        <a href={`${downloadHref}#mobile-install-guide`}>
          <HugeiconsIcon icon={SmartPhone01Icon} data-icon="inline-start" />
          {androidLabel}
        </a>
      </Button>
    );
  }

  if (platform === "ios") {
    return (
      <Button asChild size="lg">
        <a href={`${downloadHref}#mobile-install-guide`}>
          <HugeiconsIcon icon={SmartPhone01Icon} data-icon="inline-start" />
          {iosLabel}
        </a>
      </Button>
    );
  }

  if (platform === "windows") {
    return (
      <Button asChild size="lg">
        <a href={WINDOWS_STORE_DEEP_LINK}>
          <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
          {windowsLabel}
        </a>
      </Button>
    );
  }

  if (platform === "macos" || platform === "linux") {
    return (
      <Button asChild size="lg">
        <a href={downloadHref}>
          <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
          {platform === "macos" ? macLabel : linuxLabel}
        </a>
      </Button>
    );
  }

  return (
    <Button asChild size="lg">
      <TrackedCta href="/signup" location="hero">
        {browserLabel}
      </TrackedCta>
    </Button>
  );
}

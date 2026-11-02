"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Download01Icon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { resolveInstallPlatform, type InstallPlatform } from "@/lib/desktop/install-prompt";
import { cn } from "@/lib/utils";
import { PlatformLogo } from "./download-platform-cards";
import { TrackedCta } from "./tracked-cta";

type NavigatorWithUserAgentData = Navigator & { userAgentData?: { platform?: string } };

export const PLATFORM_NAMES: Record<Exclude<InstallPlatform, "unsupported">, string> = {
  macos: "Mac",
  windows: "Windows",
  linux: "Linux",
  ios: "iPhone",
  android: "Android",
};

/** The visitor's platform, read once the page runs in the browser. */
export function useInstallPlatform(): InstallPlatform {
  const [platform, setPlatform] = useState<InstallPlatform>("unsupported");
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
  return platform;
}

/**
 * "Download for Mac" with the platform's logo, leading to that platform's card
 * on the download page. Before the platform is known (server rendering, or a
 * browser that does not say), it reads "Download minddy" with a generic icon.
 */
export function PlatformDownloadLink({
  href,
  location,
  iconClassName,
  ...props
}: Omit<ComponentProps<typeof TrackedCta>, "children" | "href"> & {
  /** The download page, already localized. */
  href: string;
  iconClassName?: string;
}) {
  const t = useTranslations("Landing");
  const platform = useInstallPlatform();
  const known = platform !== "unsupported";
  return (
    <TrackedCta {...props} href={known ? `${href}#${platform}` : href} location={location}>
      {known ? (
        <>
          <span data-icon="inline-start" className={cn("size-4 shrink-0", iconClassName)} aria-hidden>
            <PlatformLogo platform={platform} />
          </span>
          {t("downloadFor", { platform: PLATFORM_NAMES[platform] })}
        </>
      ) : (
        <>
          {t("downloadMinddy")}
          <HugeiconsIcon icon={Download01Icon} data-icon="inline-end" />
        </>
      )}
    </TrackedCta>
  );
}

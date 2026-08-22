"use client";

import type { ComponentProps, ReactNode } from "react";
import { useAnalytics } from "@/lib/use-analytics";
import type { AnalyticsPropsFor } from "@/lib/analytics-events";

type DownloadPlatform = AnalyticsPropsFor<"desktop_download_clicked">["platform"];
type DownloadFormat = AnalyticsPropsFor<"desktop_download_clicked">["format"];
type DownloadArch = AnalyticsPropsFor<"desktop_download_clicked">["arch"];

/**
 * The link that launches the `.dmg`, tracked (MIN-292).
 *
 * Same form as `TrackedCta` and for the same reason: `/download` is a page
 * SERVER, it cannot call `useAnalytics()`. This wrapper only supports clicking; the label and the icon remain rendered by the server and
 * change to `children`.
 *
 * A `<a>` and not a `<Link>`: the target is not a page but a
 * redirect to a one hundred and twenty megabyte file — a preload of
 * route would make no sense.
 *
 * This click is the INTENT, not the download: this is counted by
 * `desktop_download_started`, server-side, in the route itself. The gap
 * between the two is what says a `.dmg` is not gone.
 */
export function TrackedDownloadLink({
  platform,
  format,
  arch,
  children,
  ...props
}: {
  platform: DownloadPlatform;
  format: DownloadFormat;
  arch: DownloadArch;
  children: ReactNode;
} & ComponentProps<"a">) {
  const { track } = useAnalytics();
  return (
    <a {...props} onClick={() => track("desktop_download_clicked", { platform, format, arch })}>
      {children}
    </a>
  );
}

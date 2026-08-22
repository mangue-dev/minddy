import { NextResponse, type NextRequest } from "next/server";

import {
  desktopFeedBaseUrl,
  dmgForArch,
  isLinuxArch,
  isLinuxPackageFormat,
  isMacArch,
  linuxPackageForArch,
  linuxUpdateManifestForArch,
  parseLatestLinuxFeed,
  parseLatestMacFeed,
} from "@/lib/desktop/update-feed";
import { posthogCookieName, readPosthogDistinctId } from "@/lib/posthog-cookie";
import { captureServerEvent } from "@/lib/server/posthog";

/**
 * `/api/desktop/download` — the door to `.dmg` (MIN-292).
 *
 * It exists for one reason only: **no version number should be
 * written on the page**. The name of the binary bears its version
 * (`minddy-1.2.0-arm64.dmg`), donc un lien direct depuis `/download` obligerait
 * to retouch `messages/en.json` and `messages/fr.json` with each publication — and
 * the page would lie the day we forget. Here it points to a stable URL,
 * and it is the manifesto which says where it leads.
 *
 * The file itself is never served BY us: we redirect to the blob.
 * Passing a hundred megabytes through a function would cost calculation for
 * transfer than storage does better.
 *
 * No authentication, obviously — it's a public download. And no
 * CDN cache on the redirection: it changes with each publication, and a
 * Outdated redirect sends everyone to a 404.
 *
 * ## THIS is where we count downloads
 *
 * And not by click, on the browser side. A click is an INTENTION — it also starts from it
 * the welcome banner, the settings, the landing, and the account of the three
 * will never say how many `.dmg` are actually gone. This road is the
 * obligatory passage point: everything that downloads goes through it, including a
 * link pasted into a message, and it knows what the click doesn't know — what
 * architecture, quelle version.
 *
 * It leaves without consent condition, like other server events
 * (see lib/server/posthog.ts): no cookies are SET here. The one from PostHog
 * is only READ if it already exists, to sew the download to the rest of
 * the visit; otherwise the event is anonymous and does not create any person profile.
 */

export const dynamic = "force-dynamic";

/** The default, and it is not neutral: all Macs sold since 2020. */
const DEFAULT_ARCH = "arm64";
const DEFAULT_LINUX_ARCH = "x64";

export async function GET(request: NextRequest) {
  const base = desktopFeedBaseUrl();
  if (!base) {
    return NextResponse.json(
      { error: "desktop_feed_unconfigured" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const platform = request.nextUrl.searchParams.get("platform") === "linux" ? "linux" : "macos";
  const requestedArch = request.nextUrl.searchParams.get("arch");

  if (platform === "linux") {
    const arch = isLinuxArch(requestedArch) ? requestedArch : DEFAULT_LINUX_ARCH;
    const requestedFormat = request.nextUrl.searchParams.get("format");
    const format = isLinuxPackageFormat(requestedFormat) ? requestedFormat : "AppImage";
    const response = await fetch(`${base}/${linuxUpdateManifestForArch(arch)}`, {
      cache: "no-store",
    }).catch(() => null);
    const release = response?.ok ? parseLatestLinuxFeed(await response.text()) : null;
    const file = release && linuxPackageForArch(release, format, arch);

    if (!file) {
      return NextResponse.json(
        { error: "desktop_release_unavailable", platform, format, arch },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    captureDownload(request, { platform, format, arch, version: release.version });
    return NextResponse.redirect(`${base}/${file}`, {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const arch = isMacArch(requestedArch) ? requestedArch : DEFAULT_ARCH;

  // `no-store` on reading the manifest: the `fetch` cache would retain the
  // previous version during the window following a release, i.e.
  // exactly the moment when someone comes looking for the news.
  const response = await fetch(`${base}/latest-mac.yml`, { cache: "no-store" }).catch(
    () => null
  );
  const release = response?.ok ? parseLatestMacFeed(await response.text()) : null;
  const file = release && dmgForArch(release, arch);

  if (!file) {
    return NextResponse.json(
      { error: "desktop_release_unavailable", arch },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  captureDownload(request, { platform, format: "dmg", arch, version: release.version });

  return NextResponse.redirect(`${base}/${file}`, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * The download event — emitted only when a file actually leaves.
 *
 * `$process_person_profile: false` in the anonymous case: without it, each
 * cookieless download would create one more person in PostHog, a
 * ghost of a single event. The count remains accurate - that's what we
 * cherche.
 */
function captureDownload(
  request: NextRequest,
  properties: { platform: "macos" | "linux"; format: string; arch: string; version: string }
): void {
  const cookieName = posthogCookieName(process.env.MINDDY_PUBLIC_POSTHOG_KEY);
  const known = cookieName
    ? readPosthogDistinctId(request.cookies.get(cookieName)?.value)
    : null;

  captureServerEvent({
    distinctId: known ?? crypto.randomUUID(),
    event: "desktop_download_started",
    properties: known ? properties : { ...properties, $process_person_profile: false },
  });
}

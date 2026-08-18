"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn, Spinner } from "mangue-ui";
import { ImageOff } from "lucide-react";

import { prFileRawUrl, type PrEndpoint, type PullRequestFile } from "@/lib/agent-api";

/**
 * Diff of an image (MIN-66): before and after side by side, with dimensions and
 * weight. What the diff view displays instead of “diff unavailable” when the
 * file without a patch is an image — by far the most common case, and the
 * only one that we really know how to SHOW.
 *
 * We go through `fetch` + blob rather than a `<img src>` direct on the route:
 * a `<img>` tells neither the size of the file nor the reason for a failure, and the same
 * query gives us both (`blob.size`, and the HTTP status to distinguish
 * "too heavy" from a real one failure).
 */

type Side = "base" | "head";

interface Version {
  status: "loading" | "ready" | "missing" | "failed";
  url?: string;
  bytes?: number;
  width?: number;
  height?: number;
}

/**
 * Loads a version of the image and measures its dimensions. `missing` = the
 * forge responds 404, which is the NORMAL case on the absent side (an added file
 * has no front) — not an error to report as such.
 */
function useImageVersion(endpoint: PrEndpoint, path: string, side: Side, enabled: boolean): Version {
  const [state, setState] = useState<Version>({ status: enabled ? "loading" : "missing" });

  useEffect(() => {
    if (!enabled) {
      setState({ status: "missing" });
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    setState({ status: "loading" });
    fetch(prFileRawUrl(endpoint, path, side))
      .then(async (res) => {
        if (res.status === 404) return { status: "missing" as const };
        if (!res.ok) return { status: "failed" as const };
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        objectUrl = url;
        // Dimensions read on a DETACHED image: they must be known
        // before rendering so that the legend is displayed at once, without doing
        // skip the layout once the `<img>` is mounted.
        const size = await new Promise<{ width: number; height: number } | null>((resolve) => {
          const probe = new Image();
          probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
          // An SVG without intrinsic dimensions, a format that the browser does not
          // do not decode: we display it anyway, without size legend.
          probe.onerror = () => resolve(null);
          probe.src = url;
        });
        return {
          status: "ready" as const,
          url,
          bytes: blob.size,
          width: size?.width,
          height: size?.height,
        };
      })
      .catch(() => ({ status: "failed" as const }))
      .then((next) => {
        if (cancelled) return;
        setState(next);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [endpoint, path, side, enabled]);

  return state;
}

/** Readable weight. Decimal KB/MB — those displayed by GitHub and Finder. */
function formatBytes(bytes: number, locale: string): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["kB", "MB"] as const;
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value.toLocaleString(locale, { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

/** One of the two sides: the checkerboard, the image, and its legend. */
function ImagePane({
  label,
  version,
  tone,
  locale,
}: {
  label: string;
  version: Version;
  /** Color of the border: the front is read in red, the after in green, like the diff. */
  tone: "base" | "head";
  locale: string;
}) {
  const t = useTranslations("PullRequests");

  const caption =
    version.status === "ready"
      ? [
          version.width && version.height ? `${version.width} × ${version.height}` : null,
          version.bytes != null ? formatBytes(version.bytes, locale) : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span
        className={cn(
          "text-[11px] font-medium",
          tone === "base"
            ? "text-red-600 dark:text-red-400"
            : "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {label}
      </span>
      <div
        className={cn(
          // `flex-1`: the two panels are sister columns stretched to the
          // same height, but without that each frame takes that of ITS image —
          // and two images of different sizes result in two unequal frames,
          // which reads as a misalignment rather than a gap
          // de dimensions.
          "pr-image-checker flex min-h-28 flex-1 items-center justify-center rounded border p-3",
          tone === "base"
            ? "border-red-500/30 bg-red-500/[0.04]"
            : "border-emerald-500/30 bg-emerald-500/[0.04]",
        )}
      >
        {version.status === "loading" ? (
          <Spinner className="size-4 text-muted-foreground" />
        ) : version.status === "ready" && version.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob: local, hors optimiseur
          <img
            src={version.url}
            alt={label}
            className="max-h-72 max-w-full object-contain"
            style={{ imageRendering: version.width && version.width < 64 ? "pixelated" : undefined }}
          />
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ImageOff className="size-3.5" />
            {version.status === "failed" ? t("imageFailed") : t("imageAbsent")}
          </span>
        )}
      </div>
      {caption ? (
        <span className="text-[11px] tabular-nums text-muted-foreground">{caption}</span>
      ) : null}
    </div>
  );
}

export function PrImageDiff({
  file,
  endpoint,
  locale,
}: {
  file: PullRequestFile;
  endpoint: PrEndpoint;
  locale: string;
}) {
  const t = useTranslations("PullRequests");

  // The side that does not exist is NOT requested: a request that we know is dedicated to
  // 404 would make a round trip to the forge for nothing.
  const base = useImageVersion(endpoint, file.filename, "base", file.status !== "added");
  const head = useImageVersion(endpoint, file.filename, "head", file.status !== "removed");

  // Add or delete: only one side makes sense, and show it alone and wide
  // says what happened better than a blank sign in front.
  if (file.status === "added" || file.status === "removed") {
    const only = file.status === "added" ? head : base;
    return (
      <div className="p-3">
        <ImagePane
          label={file.status === "added" ? t("imageAdded") : t("imageRemoved")}
          version={only}
          tone={file.status === "added" ? "head" : "base"}
          locale={locale}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 sm:flex-row">
      <ImagePane label={t("imageBefore")} version={base} tone="base" locale={locale} />
      <ImagePane label={t("imageAfter")} version={head} tone="head" locale={locale} />
    </div>
  );
}

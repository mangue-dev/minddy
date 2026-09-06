import { getImageProps } from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { ImageIcon } from "lucide-react";
import { cn } from "mangue-ui/lib/utils";
import { ScreenshotPicture } from "./screenshot-picture";
import {
  SCREENSHOT_SLOTS,
  screenshotSrc,
  type ScreenshotSlotId,
} from "./screenshot-slots";

const FOCUSED_SLOTS: ReadonlySet<ScreenshotSlotId> = new Set([
  "pagesEditor", "feedbackBoard", "featurePalette", "workflowAgent", "workflowPr", "numoPanel",
]);

/** Localized product photography with optional focused assets for feature cards. */
export async function ScreenshotSlot({
  id,
  className,
  priority = false,
  expandable = false,
  focused = false,
  sizes = "(min-width: 1024px) 960px, 100vw",
}: {
  id: ScreenshotSlotId;
  className?: string;
  /** To be placed on the hero's capture only (priority loading). */
  priority?: boolean;
  /** Show the whole image and offer a full-resolution modal preview. */
  expandable?: boolean;
  /** Use a published component crop while keeping the original in the lightbox. */
  focused?: boolean;
  /** Rendered width at each breakpoint; compact cards request smaller images. */
  sizes?: string;
}) {
  const slot = SCREENSHOT_SLOTS[id];
  const useFocus = focused && FOCUSED_SLOTS.has(id);
  const [locale, t] = await Promise.all([getLocale(), getTranslations("Landing")]);

  const light = screenshotSrc(slot, { theme: "light", lang: locale });
  const dark = screenshotSrc(slot, { theme: "dark", lang: locale });
  // A missing variant does NOT fall back on the other for base `src`
  // (see `screenshotSrc`) — but between two funds and nothing at all, show the
  // single published variant is better than an empty frame.
  const fallback = light ?? dark;

  return (
    <div
      className={cn(
        "relative overflow-hidden border border-border bg-card shadow-sm",
        className,
      )}
      style={{ aspectRatio: slot.ratio }}
    >
      {fallback ? (
        <Picture
          alt={t(slot.altKey)}
          light={useFocus ? (light ?? fallback).replace("/captures/", "/captures/focused/") : light ?? fallback}
          dark={useFocus ? (dark ?? fallback).replace("/captures/", "/captures/focused/") : dark ?? fallback}
          sizes={sizes}
          priority={priority}
          preview={expandable ? { light: light ?? fallback, dark: dark ?? fallback, expandLabel: t("screenshotExpand"), closeLabel: t("screenshotClose") } : undefined}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col justify-between gap-4 bg-muted/40 p-5 [background-image:repeating-linear-gradient(135deg,transparent,transparent_10px,var(--color-border)_10px,var(--color-border)_11px)] [background-size:auto] opacity-90">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
            <span className="rounded-md border border-border bg-card px-2 py-0.5 font-mono">
              {slot.id}
            </span>
          </div>
          <div className="max-w-prose rounded-lg border border-border bg-card/95 p-4 backdrop-blur-sm">
            <p className="mb-1 font-mono text-xs text-muted-foreground">{slot.route}</p>
            <p className="text-sm leading-relaxed text-foreground/90">{slot.shot}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Picture({
  alt,
  light,
  dark,
  sizes,
  priority,
  preview,
}: {
  alt: string;
  light: string;
  dark: string;
  sizes: string;
  priority: boolean;
  preview?: { light: string; dark: string; expandLabel: string; closeLabel: string };
}) {
  const common = {
    alt,
    fill: true,
    sizes,
    priority,
    loading: priority ? undefined : ("lazy" as const),
    // `<Image priority>` sets `fetchpriority="high"` itself; `getImageProps`
    // don't do it. Without him, the capture of the hero - the LCP element, measured -
    // went to the default priority of an image, that is to say behind the
    // scripts and style sheets (MIN-88).
    fetchPriority: priority ? ("high" as const) : undefined,
  };

  const {
    props: { srcSet: darkSrcSet },
  } = getImageProps({ ...common, src: dark });
  const {
    props: { srcSet: lightSrcSet, ...imgProps },
  } = getImageProps({ ...common, src: light });

  return (
    <ScreenshotPicture
      darkSrcSet={darkSrcSet}
      lightSrcSet={lightSrcSet}
      imgProps={imgProps}
      priority={priority}
      preview={preview}
    />
  );
}

/*
 * NO MANUAL `<link rel="preload">`, and this is deliberate (MIN-88).
 *
 * `getImageProps` does not generate the preload that `<Image priority>` poses,
 * so we first wrote it by hand, in two variants filtered by `media`.
 * Measured on the served HTML, it landed at byte 32,000 — well AFTER the
 * `</head>` (byte 5,400): React can only report in the header what it
 * discovers before emptying the shell, and the hero arrives long later. THE
 * Browser preload scanner reads ahead anyway: it
 * finds the `<picture>` at the same bytes, at the same time. Two tags for
 * nothing, in a page where each kilobyte delays the image.
 *
 * `ReactDOM.preload()`, it goes back into the header - but it does not accept
 * not `media`, so you would have to preload BOTH themes and redownload this
 * which the `<picture>` is precisely used to avoid.
 */

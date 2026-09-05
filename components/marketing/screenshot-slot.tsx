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

/**
 * Responsive product screenshot (MIN-73, revised in MIN-88).
 *
 * Reserves the exact place of the image via `aspect-ratio` — the layout does not
 * will not move when the real captures arrive. As long as the entrance to
 * catalog does not have a published capture, we return the capture instruction to
 * the screen: the landing remains readable and the command remains in front of your eyes.
 *
 * NO ROUNDED CORNERS IN THE IMAGE. The frame carried them (`rounded-xl` on the
 * container that is cropping), and an application capture has content all the way into
 * its corners: the sidebar at the top left, the edge of a map, a
 * counter. The round bit into it—a silent trimming, different from a
 * capture to the other depending on what was lying around the corner. A capture is shown
 * whole or not at all; it is the line which delimits the image, not a cut-out.
 *
 * ## Why a `<picture>` and more `useTheme()` (MIN-88)
 *
 * The component was a client and calculated its `src` from `resolvedTheme`. Gold
 * `resolvedTheme` is `"light"` at the FIRST rendering (the ThemeProvider of mango-ui
 * only reads `localStorage` as `useEffect`). Three consequences, all measured
 * on production: the HTML served always announced the clear variant, the header
 * `Link` therefore preloaded 222 KB of clear capture, and a theme visitor
 * dark downloaded them for nothing before loading the dark — in
 * replacing the LCP element after hydration.
 *
 * Two `<source media="(prefers-color-scheme: …)">` solves all three at once,
 * without JavaScript or cookies: the browser chooses ONE variant even before
 * React won't run. A theme cookie would have worked too, but it would have been
 * wrong on the first visit (no one has a cookie yet) and it would have returned
 * the HTML depends on cookies — therefore not cacheable by the CDN, which
 * canceled the other half of the work on the LCP.
 *
 * There remains the case of a visitor who has explicitly chosen a theme different from
 * that of his system: he will see the system variant. It's a compromise
 * assumed — the public site does not have a theme selector, this choice cannot come
 * than the app, and it only costs one capture at the wrong bottom.
 *
 * ## And the `srcset`
 *
 * The captures are 2208 px wide. They were served in `unoptimized`,
 * therefore without `srcset`: a 390 px phone downloaded the 2208 px and the
 * 222 KB. `getImageProps` (the pattern documented by Next for art direction)
 * renders the same width variants as a normal `<Image>`, in a
 * `<picture>` who also knows how to choose the theme.
 */
export async function ScreenshotSlot({
  id,
  className,
  priority = false,
  expandable = false,
  sizes = "(min-width: 1024px) 960px, 100vw",
}: {
  id: ScreenshotSlotId;
  className?: string;
  /** To be placed on the hero's capture only (priority loading). */
  priority?: boolean;
  /** Show the whole image and offer a full-resolution modal preview. */
  expandable?: boolean;
  /** Rendered width at each breakpoint; compact cards request smaller images. */
  sizes?: string;
}) {
  const slot = SCREENSHOT_SLOTS[id];
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
          light={light ?? fallback}
          dark={dark ?? fallback}
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

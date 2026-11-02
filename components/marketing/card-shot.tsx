import { existsSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { getImageProps } from "next/image";
import { getLocale } from "next-intl/server";
import { cn } from "@/lib/utils";
import { CARD_FADE as FADE, CARD_FADE_LEFT } from "./card-fade";
import { SCREENSHOT_SLOTS, screenshotSrc, type ScreenshotSlotId } from "./screenshot-slots";

/**
 * Where a card's illustration comes from: a landing capture (both themes, six
 * locales), a manual figure (`public/documentation/<locale>/`, light only), or
 * a rendered element. `crop` frames part of the image: `x` and `y` are its
 * top-left corner and `w` its width, as fractions of the image.
 */
export type CardShotSource =
  | { capture: ScreenshotSlotId; crop: Crop }
  /**
   * A capture made for the cards: `public/captures/cards/<card>-<locale>-<theme>.webp`,
   * an element on a transparent background. `surface` lays it on the app's
   * background; `fade: "left"` fades it on the left for a shot anchored on its right.
   */
  | { card: string; crop?: Crop; surface?: boolean; fade?: "left" }
  | { doc: string; crop?: Crop }
  /** The light and the dark capture side by side, split on a diagonal. */
  | { themes: ScreenshotSlotId; crop: Crop }
  | { node: ReactNode };

interface Crop {
  x: number;
  y: number;
  w: number;
}

const FULL: Crop = { x: 0, y: 0, w: 1 };

/** The rendered card is at most this wide; the crop scales the request. */
const CARD_WIDTH = 380;

/**
 * A feature card's illustration: a real screenshot framed on the part that
 * shows the feature, filling the card's lower right corner and fading out to
 * the right and at the bottom. It is decorative (the card's title says what
 * it shows), so it has no alt text.
 */
export async function CardShot({ source, className }: { source: CardShotSource; className?: string }) {
  return (
    <div aria-hidden className={cn("relative h-full w-full overflow-hidden select-none", className)}>
      <div className={cn("absolute inset-0", "card" in source && source.fade === "left" ? CARD_FADE_LEFT : FADE)}>
        {"node" in source ? (
          source.node
        ) : "themes" in source ? (
          <ThemeSplit slot={source.themes} crop={source.crop} />
        ) : "card" in source ? (
          source.surface ? (
            <div className="h-full w-full rounded-tl-xl bg-background pt-4 pl-4">
              <CroppedShot source={source} />
            </div>
          ) : (
            <CroppedShot source={source} />
          )
        ) : (
          <CroppedShot source={source} className="rounded-tl-lg border-t border-l border-border" />
        )}
      </div>
    </div>
  );
}

/**
 * A capture or a manual figure cut to `crop`, filling its container. Manual
 * figures exist in light only; a card that needs both themes uses a card
 * capture instead.
 */
/** A card capture's URL, or `null` when that variant was not published. */
function cardCapture(card: string, locale: string, theme: "light" | "dark"): string | null {
  const file = `captures/cards/${card}-${locale}-${theme}.webp`;
  return existsSync(path.join(process.cwd(), "public", file)) ? `/${file}` : null;
}

export async function CroppedShot({
  source,
  width = CARD_WIDTH,
  className,
}: {
  source: Extract<CardShotSource, { capture: unknown } | { card: unknown } | { doc: unknown }>;
  /** The container's widest rendered width, in CSS pixels. */
  width?: number;
  className?: string;
}) {
  const locale = await getLocale();
  const crop = source.crop ?? FULL;
  let light: string | null;
  let dark: string | null;
  if ("capture" in source) {
    const slot = SCREENSHOT_SLOTS[source.capture];
    light = screenshotSrc(slot, { theme: "light", lang: locale });
    dark = screenshotSrc(slot, { theme: "dark", lang: locale });
  } else if ("card" in source) {
    light = cardCapture(source.card, locale, "light");
    dark = cardCapture(source.card, locale, "dark");
  } else {
    const file = source.doc.includes(".") ? source.doc : `${source.doc}.png`;
    light = `/documentation/${locale}/${file}`;
    dark = null;
  }
  const fallback = light ?? dark;
  if (!fallback) return null;

  const common = {
    alt: "",
    width: 1600,
    height: 1000,
    sizes: `${Math.round(width / crop.w)}px`,
    loading: "lazy" as const,
  };
  const darkSrcSet = dark ? getImageProps({ ...common, src: dark }).props.srcSet : undefined;
  const { srcSet: lightSrcSet, src } = getImageProps({ ...common, src: light ?? fallback }).props;

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden",
        className,
      )}
    >
      <picture>
        {darkSrcSet && <source media="(prefers-color-scheme: dark)" srcSet={darkSrcSet} sizes={common.sizes} />}
        {/* eslint-disable-next-line @next/next/no-img-element -- the crop needs a sized,
            translated image; `getImageProps` gives the optimized sources. */}
        <img
          src={src}
          srcSet={lightSrcSet}
          sizes={common.sizes}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute top-0 left-0 h-auto max-w-none"
          style={{
            width: `${100 / crop.w}%`,
            transform: `translate(${-crop.x * 100}%, ${-crop.y * 100}%)`,
          }}
        />
      </picture>
    </div>
  );
}

async function ThemeSplit({ slot, crop }: { slot: ScreenshotSlotId; crop: Crop }) {
  const locale = await getLocale();
  const light = screenshotSrc(SCREENSHOT_SLOTS[slot], { theme: "light", lang: locale });
  const dark = screenshotSrc(SCREENSHOT_SLOTS[slot], { theme: "dark", lang: locale });
  if (!light || !dark) return null;
  const sizes = `${Math.round(CARD_WIDTH / crop.w)}px`;
  const image = (src: string, className?: string) => {
    const props = getImageProps({ alt: "", src, width: 1600, height: 1000, sizes }).props;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- cropped like `Shot`.
      <img
        src={props.src}
        srcSet={props.srcSet}
        sizes={sizes}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn("absolute top-0 left-0 h-auto max-w-none", className)}
        style={{ width: `${100 / crop.w}%`, transform: `translate(${-crop.x * 100}%, ${-crop.y * 100}%)` }}
      />
    );
  };
  return (
    <div className="relative h-full w-full overflow-hidden rounded-tl-lg">
      {image(light)}
      <div className="absolute inset-0 [clip-path:polygon(62%_0,100%_0,100%_100%,38%_100%)]">{image(dark)}</div>
    </div>
  );
}

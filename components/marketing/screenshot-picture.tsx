"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { cn } from "mangue-ui/lib/utils";

/**
 * The `<picture>` of a capture, and its fade on charge (MIN-73, MIN-88).
 *
 * Only the fade needs the client: it starts from the `load` event of the image,
 * which does not exist on the server side. Everything else — which variation to serve, in
 * which language, in which theme, at what widths — is calculated by
 * `screenshot-slot.tsx`, which is a server component.
 *
 * ENTRY ON LOAD, not just on scroll. Landing blocks enter
 * via `<Reveal>` when they cross the viewport — but a capture is in progress
 * `loading="lazy"`: it STARTS downloading around this time.
 * The appearance of the container therefore played on an empty frame, and the image fell
 * in at once, without transition, once the animation is finished. The fade
 * below is carried by the image itself and starts from its `load`: this is the
 * only moment which corresponds to “the image appears”.
 *
 * The capture of the hero is exempt (`priority`): it is the LCP candidate, and
 * starting it at zero opacity would push the metric back that much. She keeps the
 * CSS cascade of the hero, which starts from a non-zero opacity floor.
 */
export function ScreenshotPicture({
  darkSrcSet,
  lightSrcSet,
  imgProps,
  priority,
}: {
  darkSrcSet: string | undefined;
  lightSrcSet: string | undefined;
  imgProps: ComponentProps<"img">;
  priority: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const img = useRef<HTMLImageElement | null>(null);

  // `mounted`: same guard as `<Reveal>`. The server rendering does not mask ANYTHING, so
  // the landing remains readable if the script does not leave — we cannot hide
  // an image behind an animation that needs JavaScript to finish.
  // `complete`: an already cached image can be loaded BEFORE React
  // has connected its `onLoad`. The two states are posed in the same effect,
  // therefore in the same rendering: an image already there never has the opportunity to
  // disappear to reappear.
  useEffect(() => {
    setMounted(true);
    if (img.current?.complete) setLoaded(true);
  }, [imgProps.src]);

  return (
    <picture>
      {/* Art direction by SYSTEM theme, without JavaScript or cookies: the
          browser chooses only one of the two variants, even before React
          does not execute. See `screenshot-slot.tsx` for why this is not
          `useTheme()` who decides. */}
      {darkSrcSet && <source media="(prefers-color-scheme: dark)" srcSet={darkSrcSet} />}
      {lightSrcSet && <source media="(prefers-color-scheme: light)" srcSet={lightSrcSet} />}
      {/* eslint-disable-next-line @next/next/no-img-element -- props come
          of `getImageProps`, this is the documented pattern for the art direction. */}
      <img
        {...imgProps}
        ref={img}
        onLoad={() => setLoaded(true)}
        className={cn(
          "object-cover object-top",
          imgProps.className,
          !priority && [
            "transition-[opacity,transform,filter] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            mounted && !loaded && "scale-[1.03] opacity-0 blur-md",
          ],
        )}
      />
    </picture>
  );
}

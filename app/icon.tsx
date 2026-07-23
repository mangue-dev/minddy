// Generated favicon (vector) — replaces the former static `icon0.svg`.
//
// The mark is monochrome and follows the OS theme (dark on light browser chrome,
// light on dark) via a `prefers-color-scheme` rule embedded in the SVG. Its hue
// depends on the environment so a tab is never mistaken for another one:
// production stays neutral, preview is blue, local dev is pink (see lib/env.ts).
//
// This is read at build time: Next generates the icon once per build and caches
// it, and the env vars are baked in at build — the production build bakes the
// neutral mark, the preview build the blue one, a local build the pink one.

import { getAppEnv, FAVICON_COLORS } from "@/lib/env";
import { MINDDY_LOGO_PATH, MINDDY_LOGO_VIEWBOX } from "@/lib/brand";

export const contentType = "image/svg+xml";

const { light: lightColor, dark: darkColor } = FAVICON_COLORS[getAppEnv()];

export default function Icon() {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MINDDY_LOGO_VIEWBOX}" role="img" aria-label="minddy">` +
    `<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="${MINDDY_LOGO_PATH}"/>` +
    `<style>svg{color:${lightColor}}@media(prefers-color-scheme:dark){svg{color:${darkColor}}}</style>` +
    `</svg>`;

  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml" },
  });
}

"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";

/**
 * Apply the theme BEFORE the first paint — mango-ui's ThemeProvider only usesEffect, especially
 * visible on anonymous public pages. Same logic as him: localStorage
 * "mangue-ui-theme", server-driven default ("dark" for the app, "system"
 * for the public — MIN-60).
 *
 * The script is injected via `useServerInsertedHTML` — HARD in the <head>
 * streamed, OUT of the React tree — and the component renders nothing. A <script>
 * rendered by a component would make React 19 moan at each client re-rendering of the root
 * layout (“Scripts inside React components are never executed when rendering on
 * the client”: refresh RSC, locale toggle, public↔app transition), then
 * that it should only be executed when parsing the initial document. Here: same position,
 * same pre-paint timing, zero elements managed by React.
 *
 * ── The color of the status bar (MIN-284) ──────────────────────or `<meta name="theme-color">`, which tints the status bar of the installed app
 * and the toolbar of Chrome Android. Without it, Minddy in Dark
 * opens under a white banner: the color doesn't follow the theme and the stitching
 * is visible — precisely the kind of detail never consciously noticed, and which
 * makes a web app look like a web app.
 *
 * Why HERE rather than in the `viewport` export of the root layout, who knows
 * yet write a `themeColor`: Next only accepts a STATIC value, au
 * better expressed by `prefers-color-scheme`. However, Minddy's theme is not deduced
 * from the system — it comes from localStorage, and the app forces `dark` by default
 * even on a clear OS (MIN-60). A static tag would therefore be false for
 * the most common case. This script has already resolved the actual theme: it only has to write the corresponding color.
 *
 * The following observer keeps the tag up to date when the user switches the theme along the way. It looks at the <html> class — what mango-ui's
 * ThemeProvider modifies — rather than subscribing to a provider which
 * lives in node_modules: a single observer, filtered on a single attribute.
 */

/**
 * `--background` of the two themes, in hexadecimal.
 *
 * `theme-color` is read by the browser OFF the page: it cannot
 * point to `var(--background)`, and not all engines know again
 * parse `oklch()` into this tag. Hence the conversion, done by hand —
 * `lib/mobile-touch.test.ts` rereads the mango-ui tokens and fails if one of the
 * two `--background` moves, so that we recalculate instead of deriving.
 */
const THEME_COLOR = {
  light: "#f5f7fb", // oklch(0.975 0.006 266)
  dark: "#070809", // oklch(0.135 0.003 250)
} as const;
export function ThemeInitScript({ defaultTheme }: { defaultTheme: "dark" | "system" }) {
  // The callback can be called at each flush of the stream: we only insert once.
  const inserted = useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return (
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var r=document.documentElement;function p(d){var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.setAttribute("name","theme-color");document.head.appendChild(m);}m.setAttribute("content",d?"${THEME_COLOR.dark}":"${THEME_COLOR.light}");}try{var t=localStorage.getItem("mangue-ui-theme")||"${defaultTheme}";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);r.classList.toggle("dark",d);}catch(e){r.classList.toggle("dark",${
            defaultTheme === "system"
              ? `matchMedia("(prefers-color-scheme: dark)").matches`
              : "true"
          });}p(r.classList.contains("dark"));try{new MutationObserver(function(){p(r.classList.contains("dark"));}).observe(r,{attributes:true,attributeFilter:["class"]});}catch(e){}})();`,
        }}
      />
    );
  });
  return null;
}

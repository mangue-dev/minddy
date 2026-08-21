"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { buildThemeScript, type ThemeScriptInput } from "@/lib/theme-script";

/**
 * Apply the theme BEFORE the first paint — mango-ui's ThemeProvider only
 * applies in an effect, especially visible on anonymous public pages. Same
 * logic as the provider: localStorage "mangue-ui-theme", server-driven
 * default ("dark" for the app, "system" for the public — MIN-60), and — on
 * app routes — the theme saved on the ACCOUNT (`lib/theme-script.ts` has the
 * full resolution order).
 *
 * The script is injected via `useServerInsertedHTML` — straight into the
 * streamed <head>, OUT of the React tree — and the component renders nothing.
 * A <script> rendered by a component makes React 19 complain at each client
 * re-render of the root layout (“Scripts inside React components are never
 * executed when rendering on the client”: RSC refresh, locale toggle,
 * public↔app transition) — and it would only need to run while parsing the
 * initial document anyway. Here: same position, same pre-paint timing, zero
 * elements managed by React.
 *
 * ── Status-bar color (MIN-284) ────────────────────────────────────────────
 * `<meta name="theme-color">` tints the status bar of the installed app and
 * the toolbar of Chrome Android. Without it, minddy in dark opens under a
 * white banner: the color doesn't follow the theme and the seam is visible —
 * exactly the kind of detail nobody notices consciously, yet which makes a
 * web app feel like a web app.
 *
 * Why HERE rather than in the `viewport` export of the root layout, which
 * could otherwise write a `themeColor`: Next only accepts a STATIC value,
 * best expressed as `prefers-color-scheme`. But minddy's theme is not deduced
 * from the system — it comes from localStorage (or the account), and the app
 * forces `dark` by default even on a light OS (MIN-60). A static tag would be
 * wrong for the most common case. This script has already resolved the actual
 * theme; it only has to write the matching color.
 *
 * The observer below keeps the tag current when the user switches themes mid-
 * session. It watches the <html> class — what mango-ui's ThemeProvider
 * toggles — rather than subscribing to a provider that lives in node_modules:
 * one observer, filtered on one attribute.
 */
export function ThemeInitScript(props: ThemeScriptInput) {
  // The callback can fire at each flush of the stream: insert only once.
  const inserted = useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return (
      <script
        dangerouslySetInnerHTML={{ __html: buildThemeScript(props) }}
      />
    );
  });
  return null;
}

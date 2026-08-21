/**
 * The anti-FOUC script BODY, as a pure string —
 * `components/theme-init-script.tsx` only injects it (via
 * `useServerInsertedHTML`, out of the React tree). Kept out of the component
 * so `lib/theme-init-script.test.ts` can execute it without React: this code
 * runs before React exists, and a regression here is only visible as a flash
 * of the wrong theme.
 *
 * Resolution order of `t`, the saved setting:
 * 1. `accountTheme` — the theme saved on the signed-in account, asserted by
 *    the proxy (`lib/account-theme.ts`). It wins over the device cache: the
 *    account follows its owner across devices. The value is also MIRRORED
 *    back into localStorage, so mango-ui's ThemeProvider — which reads that
 *    key on mount — lands on the same choice instead of flipping `<html>`
 *    back right after hydration.
 * 2. localStorage — the device cache; anonymous visitors stop here.
 * 3. `defaultTheme` — the server default ("dark" for the app, "system" for
 *    public pages — MIN-60).
 */

/** `--background` of the two themes, in hexadecimal.
 *
 * `theme-color` is read by the browser OFF the page: it cannot point to
 * `var(--background)`, and not every engine parses `oklch()` in this tag.
 * Hence the conversion done by hand — `lib/mobile-touch.test.ts` re-reads the
 * mango-ui tokens and fails if either `--background` moves, so that these are
 * recalculated instead of derived.
 */
const THEME_COLOR = {
  light: "#f5f7fb", // oklch(0.975 0.006 266)
  dark: "#070809", // oklch(0.135 0.003 250)
} as const;

/** What the fallback branch (localStorage unreadable) resolves to. A "system"
 * default follows the OS even there; a literal value IS its own resolution —
 * including the account themes, which can be "light". */
function fallbackExpression(defaultTheme: "light" | "dark" | "system"): string {
  return defaultTheme === "system"
    ? `matchMedia("(prefers-color-scheme: dark)").matches`
    : defaultTheme === "dark"
      ? "true"
      : "false";
}

export interface ThemeScriptInput {
  defaultTheme: "dark" | "system" | "light";
  /** Theme saved on the signed-in account, when the proxy asserts one. */
  accountTheme?: "light" | "dark" | "system" | null;
}

export function buildThemeScript({
  defaultTheme,
  accountTheme = null,
}: ThemeScriptInput): string {
  const storageKey = "mangue-ui-theme";
  // Account theme wins; otherwise the device cache, then the server default.
  const source = accountTheme
    ? JSON.stringify(accountTheme)
    : `localStorage.getItem("${storageKey}")||"${defaultTheme}"`;
  const mirrorBack = accountTheme
    ? `try{localStorage.setItem("${storageKey}",t);}catch(e){}`
    : "";
  return `(function(){var r=document.documentElement;function p(d){var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.setAttribute("name","theme-color");document.head.appendChild(m);}m.setAttribute("content",d?"${THEME_COLOR.dark}":"${THEME_COLOR.light}");}try{var t=${source};${mirrorBack}var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);r.classList.toggle("dark",d);}catch(e){r.classList.toggle("dark",${
    fallbackExpression(defaultTheme)
  });}p(r.classList.contains("dark"));try{new MutationObserver(function(){p(r.classList.contains("dark"));}).observe(r,{attributes:true,attributeFilter:["class"]});}catch(e){}})();`;
}

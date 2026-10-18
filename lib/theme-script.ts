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
 *
 * The account's palettes (MIN-696) need no resolution: the proxy asserts them
 * on every app document, so they are written onto <html> as they come, and
 * never cached on the device — another account on the same browser starts
 * from its own choice, not the previous one's.
 */

import {
  DEFAULT_THEME_PRESETS,
  isDarkThemePreset,
  isLightThemePreset,
  THEME_PRESET_ATTRIBUTES,
  THEME_PRESETS,
  THEME_TRANSPARENCY_ATTRIBUTE,
  type ThemeAppearance,
} from "./theme-presets";

/** `<meta name="theme-color">` per palette, keyed by preset id.
 *
 * `theme-color` is read by the browser OFF the page: it cannot point to
 * `var(--background)`, and not every engine parses `oklch()` in this tag.
 * Hence the hexadecimal values in the catalog (`lib/theme-presets.ts`); the
 * Minddy defaults are a manual conversion of mango-ui's `--background`, which
 * `lib/mobile-touch.test.ts` re-reads so that a moved token is recalculated.
 * The script reads the attribute of the ACTIVE mode, so the bar follows both
 * a mode switch and a palette switch. */
const CHROME_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(THEME_PRESETS).map(([id, preset]) => [id, preset.chromeColor]),
);
const DEFAULT_CHROME = {
  light: THEME_PRESETS[DEFAULT_THEME_PRESETS.light].chromeColor,
  dark: THEME_PRESETS[DEFAULT_THEME_PRESETS.dark].chromeColor,
} as const;

/** What the fallback branch (localStorage unreadable) resolves to. A "system"
 * default follows the OS even there; a literal value IS its own resolution —
 * including the account themes, which can be "light". */
function fallbackExpression(defaultTheme: "light" | "dark" | "system"): string {
  return defaultTheme === "system"
    ? `matchMedia("(prefers-color-scheme: dark)").matches`
    : defaultTheme === "light"
      ? "false"
      : "true";
}

export interface ThemeScriptInput {
  defaultTheme: "dark" | "system" | "light";
  /** Theme saved on the signed-in account, when the proxy asserts one. */
  accountTheme?: "light" | "dark" | "system" | null;
  /** Palettes and glass toggle of the signed-in account (MIN-696). Absent on
   * public pages, which keep the Minddy palettes. */
  appearance?: ThemeAppearance | null;
}

/** The root attributes for an account appearance — validated ids only, so
 * nothing outside the catalog reaches executable script text. */
function appearanceStatements(appearance: ThemeAppearance | null): string {
  if (!appearance) return "";
  const light = isLightThemePreset(appearance.light)
    ? appearance.light
    : DEFAULT_THEME_PRESETS.light;
  const dark = isDarkThemePreset(appearance.dark)
    ? appearance.dark
    : DEFAULT_THEME_PRESETS.dark;
  const glass = appearance.transparency === false ? "off" : "on";
  return `r.setAttribute("${THEME_PRESET_ATTRIBUTES.light}","${light}");`
    + `r.setAttribute("${THEME_PRESET_ATTRIBUTES.dark}","${dark}");`
    + `r.setAttribute("${THEME_TRANSPARENCY_ATTRIBUTE}","${glass}");`;
}

export function buildThemeScript({
  defaultTheme,
  accountTheme = null,
  appearance = null,
}: ThemeScriptInput): string {
  const storageKey = "mangue-ui-theme";
  // Runtime allowlists keep arbitrary values out of executable script text.
  const defaultLiteral = defaultTheme === "light" ? '"light"'
    : defaultTheme === "system" ? '"system"' : '"dark"';
  const accountLiteral = accountTheme === "light" ? '"light"'
    : accountTheme === "dark" ? '"dark"'
      : accountTheme === "system" ? '"system"' : null;
  const source = accountLiteral
    ?? `localStorage.getItem("${storageKey}")||${defaultLiteral}`;
  const mirrorBack = accountLiteral
    ? `try{localStorage.setItem("${storageKey}",t);}catch(e){}`
    : "";
  // The palette attributes go first, outside the storage `try`: an
  // unreadable localStorage must not cost the account its palettes.
  return `(function(){var r=document.documentElement;var C=${JSON.stringify(CHROME_COLORS)};function p(){var d=r.classList.contains("dark");var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.setAttribute("name","theme-color");document.head.appendChild(m);}m.setAttribute("content",C[r.getAttribute(d?"${THEME_PRESET_ATTRIBUTES.dark}":"${THEME_PRESET_ATTRIBUTES.light}")]||(d?"${DEFAULT_CHROME.dark}":"${DEFAULT_CHROME.light}"));}${appearanceStatements(appearance)}try{var t=${source};${mirrorBack}var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);r.classList.toggle("dark",d);}catch(e){r.classList.toggle("dark",${
    fallbackExpression(defaultTheme)
  });}p();try{new MutationObserver(p).observe(r,{attributes:true,attributeFilter:["class","${THEME_PRESET_ATTRIBUTES.light}","${THEME_PRESET_ATTRIBUTES.dark}"]});}catch(e){}})();`;
}

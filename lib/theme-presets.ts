/**
 * THEME PRESETS (MIN-696) — the ready-made palettes an account can pick, one
 * for light mode and one for dark mode.
 *
 * The light/dark/system MODE stays where it was (`lib/account-theme.ts`,
 * mango-ui's `.dark` class). A palette only recolors the mode it belongs to:
 * the account saves a light palette AND a dark palette, and whichever mode is
 * active picks its own. Switching modes, or the OS switching under "system",
 * therefore lands on the palette chosen for that mode — never on one palette
 * stretched over both.
 *
 * How a palette reaches the screen:
 * - `user_metadata.theme_light` / `theme_dark` hold the preset ids, and
 *   `theme_transparency` the floating-surface glass toggle;
 * - the proxy re-asserts them as trusted `x-minddy-*` headers on app routes,
 *   and the pre-paint script copies them onto `<html>` as `data-theme-light`,
 *   `data-theme-dark` and `data-transparency` before the first paint;
 * - `app/theme-presets.css` keys every palette on those attributes, combined
 *   with the mode class, so both choices can sit on the root at once.
 *
 * Missing or unknown ids resolve to the minddy palette of their mode, which
 * has no CSS at all: the default appearance is exactly the one that existed
 * before presets. Ids are mode-specific — a dark id is not a light palette.
 *
 * This module is PURE (no React, no DOM): the proxy, the root layout, the
 * pre-paint script builder, the server account settings, the import filter
 * and the settings screen all read the same catalog.
 *
 * The accent presets keep minddy's surfaces and text: they recolor only the
 * primary action and the focus ring. Their primary colors are Tailwind's 600 (light) and 400 (dark)
 * steps, chosen so the text on them keeps 4.5:1.
 *
 * Palette sources: Solarized (Ethan Schoonover, MIT), Catppuccin Latte and
 * Mocha (MIT), Nord (Arctic Ice Studio, MIT). Their roles are adapted to
 * minddy's semantic tokens, and some text values are adjusted so normal text
 * keeps a 4.5:1 contrast (`lib/theme-presets.test.ts` measures every one).
 */

export type ThemeMode = "light" | "dark";

export const LIGHT_THEME_PRESETS = [
  "minddy-light",
  "blue-light",
  "violet-light",
  "green-light",
  "orange-light",
  "rose-light",
  "solarized-light",
  "catppuccin-latte",
  "nord-light",
  "high-contrast-light",
] as const;

export const DARK_THEME_PRESETS = [
  "minddy-dark",
  "blue-dark",
  "violet-dark",
  "green-dark",
  "orange-dark",
  "rose-dark",
  "solarized-dark",
  "catppuccin-mocha",
  "nord-dark",
  "high-contrast-dark",
] as const;

export type LightThemePreset = (typeof LIGHT_THEME_PRESETS)[number];
export type DarkThemePreset = (typeof DARK_THEME_PRESETS)[number];
export type ThemePresetId = LightThemePreset | DarkThemePreset;

export const THEME_PRESETS_BY_MODE = {
  light: LIGHT_THEME_PRESETS,
  dark: DARK_THEME_PRESETS,
} as const;

export const DEFAULT_THEME_PRESETS = {
  light: "minddy-light",
  dark: "minddy-dark",
} as const satisfies { light: LightThemePreset; dark: DarkThemePreset };

/** Account metadata keys — flat, so a light-only write never touches dark. */
export const THEME_PRESET_META_KEYS = {
  light: "theme_light",
  dark: "theme_dark",
} as const;
export const THEME_TRANSPARENCY_META_KEY = "theme_transparency";

/** Trusted request headers asserted by the proxy (stripped from clients). */
export const THEME_PRESET_HEADERS = {
  light: "x-minddy-theme-light",
  dark: "x-minddy-theme-dark",
} as const;
export const THEME_TRANSPARENCY_HEADER = "x-minddy-transparency";

/** `<html>` attributes the palettes and the glass toggle are keyed on. */
export const THEME_PRESET_ATTRIBUTES = {
  light: "data-theme-light",
  dark: "data-theme-dark",
} as const;
export const THEME_TRANSPARENCY_ATTRIBUTE = "data-transparency";

/** How the settings menu groups the presets:
 * - `accent`: minddy's own neutral surfaces; only the accent color (primary
 *   actions and the focus ring) changes, as with Radix's accent scales;
 * - `palette`: complete third-party palettes that recolor every surface;
 * - `accessibility`: high contrast. */
export type ThemePresetGroup = "accent" | "palette" | "accessibility";
export const THEME_PRESET_GROUPS: readonly ThemePresetGroup[] = ["accent", "palette", "accessibility"];

/** Labels the settings screen translates (`Account` namespace). */
export type ThemePresetLabelKey =
  | "themePresetBlue"
  | "themePresetViolet"
  | "themePresetGreen"
  | "themePresetOrange"
  | "themePresetRose"
  | "themePresetHighContrast";

export interface ThemePresetInfo {
  mode: ThemeMode;
  group: ThemePresetGroup;
  /** A proper name shown as is in every locale, or a translated label. */
  label: { name: string } | { key: ThemePresetLabelKey };
  /** Raises text and border contrast (accessibility presets). */
  highContrast: boolean;
  /** Settings preview, mirrored from `app/theme-presets.css` (the test
   * compares them): content surface, chrome, text, and primary action. */
  swatch: {
    background: string;
    sidebar: string;
    foreground: string;
    primary: string;
  };
  /** `<meta name="theme-color">`: the browser and status-bar chrome. */
  chromeColor: string;
}

export const THEME_PRESETS: Record<ThemePresetId, ThemePresetInfo> = {
  "minddy-light": {
    mode: "light",
    group: "accent",
    label: { name: "minddy" },
    highContrast: false,
    swatch: { background: "#ffffff", sidebar: "#f3f4f6", foreground: "#0a0a0a", primary: "#16181e" },
    // mango-ui's light `--background`, in hexadecimal: `theme-color` is read
    // off the page, so it cannot point to a variable (see lib/theme-script.ts).
    chromeColor: "#f5f7fb",
  },
  "blue-light": {
    mode: "light",
    group: "accent",
    label: { key: "themePresetBlue" },
    highContrast: false,
    swatch: { background: "#ffffff", sidebar: "#f3f4f6", foreground: "#0a0a0a", primary: "#2563eb" },
    chromeColor: "#f5f7fb",
  },
  "violet-light": {
    mode: "light",
    group: "accent",
    label: { key: "themePresetViolet" },
    highContrast: false,
    swatch: { background: "#ffffff", sidebar: "#f3f4f6", foreground: "#0a0a0a", primary: "#7c3aed" },
    chromeColor: "#f5f7fb",
  },
  "green-light": {
    mode: "light",
    group: "accent",
    label: { key: "themePresetGreen" },
    highContrast: false,
    swatch: { background: "#ffffff", sidebar: "#f3f4f6", foreground: "#0a0a0a", primary: "#15803d" },
    chromeColor: "#f5f7fb",
  },
  "orange-light": {
    mode: "light",
    group: "accent",
    label: { key: "themePresetOrange" },
    highContrast: false,
    swatch: { background: "#ffffff", sidebar: "#f3f4f6", foreground: "#0a0a0a", primary: "#c2410c" },
    chromeColor: "#f5f7fb",
  },
  "rose-light": {
    mode: "light",
    group: "accent",
    label: { key: "themePresetRose" },
    highContrast: false,
    swatch: { background: "#ffffff", sidebar: "#f3f4f6", foreground: "#0a0a0a", primary: "#e11d48" },
    chromeColor: "#f5f7fb",
  },
  "solarized-light": {
    mode: "light",
    group: "palette",
    label: { name: "Solarized Light" },
    highContrast: false,
    swatch: { background: "#fdf6e3", sidebar: "#eee8d5", foreground: "#073642", primary: "#073642" },
    chromeColor: "#eee8d5",
  },
  "catppuccin-latte": {
    mode: "light",
    group: "palette",
    label: { name: "Catppuccin Latte" },
    highContrast: false,
    swatch: { background: "#eff1f5", sidebar: "#e6e9ef", foreground: "#4c4f69", primary: "#8839ef" },
    chromeColor: "#e6e9ef",
  },
  "nord-light": {
    mode: "light",
    group: "palette",
    label: { name: "Nord Light" },
    highContrast: false,
    swatch: { background: "#eceff4", sidebar: "#e5e9f0", foreground: "#2e3440", primary: "#4a6b94" },
    chromeColor: "#e5e9f0",
  },
  "high-contrast-light": {
    mode: "light",
    group: "accessibility",
    label: { key: "themePresetHighContrast" },
    highContrast: true,
    swatch: { background: "#ffffff", sidebar: "#f0f0f0", foreground: "#000000", primary: "#000000" },
    chromeColor: "#f0f0f0",
  },
  "minddy-dark": {
    mode: "dark",
    group: "accent",
    label: { name: "minddy" },
    highContrast: false,
    swatch: { background: "#0f0f0f", sidebar: "#0d0e10", foreground: "#fafafa", primary: "#f4f5f8" },
    // mango-ui's dark `--background`, in hexadecimal.
    chromeColor: "#070809",
  },
  "blue-dark": {
    mode: "dark",
    group: "accent",
    label: { key: "themePresetBlue" },
    highContrast: false,
    swatch: { background: "#0f0f0f", sidebar: "#0d0e10", foreground: "#fafafa", primary: "#60a5fa" },
    chromeColor: "#070809",
  },
  "violet-dark": {
    mode: "dark",
    group: "accent",
    label: { key: "themePresetViolet" },
    highContrast: false,
    swatch: { background: "#0f0f0f", sidebar: "#0d0e10", foreground: "#fafafa", primary: "#a78bfa" },
    chromeColor: "#070809",
  },
  "green-dark": {
    mode: "dark",
    group: "accent",
    label: { key: "themePresetGreen" },
    highContrast: false,
    swatch: { background: "#0f0f0f", sidebar: "#0d0e10", foreground: "#fafafa", primary: "#4ade80" },
    chromeColor: "#070809",
  },
  "orange-dark": {
    mode: "dark",
    group: "accent",
    label: { key: "themePresetOrange" },
    highContrast: false,
    swatch: { background: "#0f0f0f", sidebar: "#0d0e10", foreground: "#fafafa", primary: "#fb923c" },
    chromeColor: "#070809",
  },
  "rose-dark": {
    mode: "dark",
    group: "accent",
    label: { key: "themePresetRose" },
    highContrast: false,
    swatch: { background: "#0f0f0f", sidebar: "#0d0e10", foreground: "#fafafa", primary: "#fb7185" },
    chromeColor: "#070809",
  },
  "solarized-dark": {
    mode: "dark",
    group: "palette",
    label: { name: "Solarized Dark" },
    highContrast: false,
    swatch: { background: "#002b36", sidebar: "#073642", foreground: "#eee8d5", primary: "#eee8d5" },
    chromeColor: "#073642",
  },
  "catppuccin-mocha": {
    mode: "dark",
    group: "palette",
    label: { name: "Catppuccin Mocha" },
    highContrast: false,
    swatch: { background: "#1e1e2e", sidebar: "#181825", foreground: "#cdd6f4", primary: "#cba6f7" },
    chromeColor: "#181825",
  },
  "nord-dark": {
    mode: "dark",
    group: "palette",
    label: { name: "Nord" },
    highContrast: false,
    swatch: { background: "#2e3440", sidebar: "#272c36", foreground: "#eceff4", primary: "#88c0d0" },
    chromeColor: "#272c36",
  },
  "high-contrast-dark": {
    mode: "dark",
    group: "accessibility",
    label: { key: "themePresetHighContrast" },
    highContrast: true,
    swatch: { background: "#000000", sidebar: "#0d0d0d", foreground: "#ffffff", primary: "#ffffff" },
    chromeColor: "#0d0d0d",
  },
};

export function isLightThemePreset(value: unknown): value is LightThemePreset {
  return typeof value === "string" && (LIGHT_THEME_PRESETS as readonly string[]).includes(value);
}

export function isDarkThemePreset(value: unknown): value is DarkThemePreset {
  return typeof value === "string" && (DARK_THEME_PRESETS as readonly string[]).includes(value);
}

/** Mode-specific guard: an id of the other mode is rejected. */
export function isThemePresetFor(mode: ThemeMode, value: unknown): value is ThemePresetId {
  return mode === "light" ? isLightThemePreset(value) : isDarkThemePreset(value);
}

/** What the account wants on screen, beyond the light/dark/system mode. */
export interface ThemeAppearance {
  light: LightThemePreset;
  dark: DarkThemePreset;
  /** Translucent, blurred popovers and menus. On by default. */
  transparency: boolean;
}

export const DEFAULT_THEME_APPEARANCE: ThemeAppearance = {
  light: DEFAULT_THEME_PRESETS.light,
  dark: DEFAULT_THEME_PRESETS.dark,
  transparency: true,
};

/**
 * The appearance saved on the account. Each field defaults on its own: a
 * missing or invalid value never borrows the other mode's choice, and
 * resolving defaults writes nothing back (old accounts stay as they are).
 */
export function resolveThemeAppearance(
  meta: Record<string, unknown> | null | undefined,
): ThemeAppearance {
  const light = meta?.[THEME_PRESET_META_KEYS.light];
  const dark = meta?.[THEME_PRESET_META_KEYS.dark];
  return {
    light: isLightThemePreset(light) ? light : DEFAULT_THEME_PRESETS.light,
    dark: isDarkThemePreset(dark) ? dark : DEFAULT_THEME_PRESETS.dark,
    transparency: meta?.[THEME_TRANSPARENCY_META_KEY] !== false,
  };
}

/** Same resolution, from the proxy's header values (strings or absent). */
export function parseThemeAppearanceHeaders(
  get: (name: string) => string | null | undefined,
): ThemeAppearance {
  const light = get(THEME_PRESET_HEADERS.light);
  const dark = get(THEME_PRESET_HEADERS.dark);
  return {
    light: isLightThemePreset(light) ? light : DEFAULT_THEME_PRESETS.light,
    dark: isDarkThemePreset(dark) ? dark : DEFAULT_THEME_PRESETS.dark,
    transparency: get(THEME_TRANSPARENCY_HEADER) !== "off",
  };
}

/** The header set the proxy asserts for an appearance. */
export function themeAppearanceHeaders(appearance: ThemeAppearance): Record<string, string> {
  return {
    [THEME_PRESET_HEADERS.light]: appearance.light,
    [THEME_PRESET_HEADERS.dark]: appearance.dark,
    [THEME_TRANSPARENCY_HEADER]: appearance.transparency ? "on" : "off",
  };
}

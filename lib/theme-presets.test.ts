import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DARK_THEME_PRESETS,
  DEFAULT_THEME_APPEARANCE,
  isThemePresetFor,
  LIGHT_THEME_PRESETS,
  parseThemeAppearanceHeaders,
  resolveThemeAppearance,
  THEME_PRESETS,
  themeAppearanceHeaders,
  type ThemePresetId,
} from "./theme-presets";

const CSS = readFileSync(join(__dirname, "../app/theme-presets.css"), "utf8");

/** Minddy's own values (app/tokens.css and the globals.css shell
 * overrides, converted from oklch): what a preset block leaves undeclared. */
const MINDDY_TOKENS = {
  light: {
    "--background": "#ffffff", "--card": "#ffffff", "--popover": "#ffffff", "--sidebar": "#f3f4f6",
    "--foreground": "#0a0a0a", "--muted-foreground": "#606369", "--muted": "#e7e9ef",
    "--accent": "#eaedf4", "--control": "#f4f6f9", "--primary": "#16181e", "--primary-foreground": "#ffffff",
    "--ring": "#555555", "--border": "#d9dce5",
  },
  dark: {
    "--background": "#0f0f0f", "--card": "#0f0f0f", "--popover": "#0f0f0f", "--sidebar": "#0d0e10",
    "--foreground": "#fafafa", "--muted-foreground": "#858688", "--muted": "#1d1e21",
    "--accent": "#222326", "--control": "#232427", "--primary": "#f4f5f8", "--primary-foreground": "#0f1216",
    "--ring": "#b7b7b7", "--border": "#1e1e1e",
  },
} as const;

/** The tokens in force under a preset: its own block over Minddy's values. */
function presetTokens(id: ThemePresetId): Record<string, string> {
  return { ...MINDDY_TOKENS[THEME_PRESETS[id].mode], ...declaredTokens(id) };
}

/** The custom properties a preset's own block declares, by token name. */
function declaredTokens(id: ThemePresetId): Record<string, string> {
  const { mode } = THEME_PRESETS[id];
  const selector = mode === "light"
    ? `html:not(.dark)[data-theme-light="${id}"] {`
    : `html.dark[data-theme-dark="${id}"] {`;
  const start = CSS.indexOf(selector);
  if (start < 0) return {};
  const body = CSS.slice(start + selector.length, CSS.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  );
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [16, 8, 0].map((shift) => {
    const c = ((n >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** sRGB mix, enough to bound what a translucent menu shows through. */
function mix(top: string, under: string, topShare: number): string {
  const channel = (hex: string, shift: number) => (Number.parseInt(hex.slice(1), 16) >> shift) & 255;
  return `#${[16, 8, 0]
    .map((shift) => Math.round(channel(top, shift) * topShare + channel(under, shift) * (1 - topShare)))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** A selector list split on its top-level commas (not those inside `:is()`). */
function topLevelSelectors(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of list) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  return [...parts, current];
}

const CUSTOM_PRESETS = (Object.keys(THEME_PRESETS) as ThemePresetId[]).filter(
  (id) => !id.startsWith("minddy-"),
);

describe("theme preset catalog", () => {
  it("keeps every id in exactly one mode", () => {
    for (const id of LIGHT_THEME_PRESETS) expect(THEME_PRESETS[id].mode).toBe("light");
    for (const id of DARK_THEME_PRESETS) expect(THEME_PRESETS[id].mode).toBe("dark");
    expect(isThemePresetFor("light", "nord-dark")).toBe(false);
    expect(isThemePresetFor("dark", "nord-light")).toBe(false);
    expect(isThemePresetFor("dark", "nord-dark")).toBe(true);
  });

  it("labels every preset and keeps Minddy first in the accent group", () => {
    for (const mode of ["light", "dark"] as const) {
      const presets = mode === "light" ? LIGHT_THEME_PRESETS : DARK_THEME_PRESETS;
      expect(presets[0]).toBe(`minddy-${mode}`);
      expect(THEME_PRESETS[presets[0]].group).toBe("accent");
      expect(presets.filter((id) => THEME_PRESETS[id].group === "accent").length).toBeGreaterThan(1);
    }
  });

  it("offers a high-contrast palette in each mode", () => {
    expect(LIGHT_THEME_PRESETS.filter((id) => THEME_PRESETS[id].highContrast)).toHaveLength(1);
    expect(DARK_THEME_PRESETS.filter((id) => THEME_PRESETS[id].highContrast)).toHaveLength(1);
  });
});

describe("resolveThemeAppearance", () => {
  it("defaults each field on its own, never borrowing the other mode", () => {
    expect(resolveThemeAppearance(undefined)).toEqual(DEFAULT_THEME_APPEARANCE);
    expect(resolveThemeAppearance({ theme_dark: "nord-dark" })).toEqual({
      light: "minddy-light",
      dark: "nord-dark",
      transparency: true,
    });
    expect(resolveThemeAppearance({ theme_light: "nord-dark", theme_dark: 42, theme_transparency: false })).toEqual({
      light: "minddy-light",
      dark: "minddy-dark",
      transparency: false,
    });
  });

  it("round-trips through the proxy headers", () => {
    const appearance = { light: "catppuccin-latte", dark: "high-contrast-dark", transparency: false } as const;
    const headers = themeAppearanceHeaders(appearance);
    expect(parseThemeAppearanceHeaders((name) => headers[name])).toEqual(appearance);
    expect(parseThemeAppearanceHeaders(() => "garbage")).toEqual(DEFAULT_THEME_APPEARANCE);
  });
});

describe("app/theme-presets.css", () => {
  it("leaves the Minddy palettes without any rule (the existing tokens stay as they are)", () => {
    expect(CSS).not.toMatch(/data-theme-(light|dark)="minddy-(light|dark)"\]\s*\{/);
  });

  it("scopes every rule to a preset or the transparency toggle, so default modes never change", () => {
    const rules = [...CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{[^{}]*\}/g)];
    expect(rules.length).toBeGreaterThan(20);
    for (const [, selector] of rules) {
      for (const part of topLevelSelectors(selector)) {
        expect(part, selector.trim()).toMatch(/data-theme-(light|dark)|data-transparency/);
      }
    }
  });

  it("gives the high-contrast palettes control boundaries and a visible keyboard focus", () => {
    const section = CSS.slice(CSS.indexOf("High contrast: boundaries"));
    for (const fragment of ['[data-slot="input"]', '[data-slot="select-trigger"]', '[data-slot="switch"]',
      '[data-slot="dialog-content"]', '[data-slot="dropdown-menu-content"]', ".app-tab",
      '[aria-current]:not([aria-current="false"])', '[role="option"][aria-selected="true"]', ":focus-visible"]) {
      expect(section, fragment).toContain(fragment);
    }
  });

  it.each(CUSTOM_PRESETS)("%s: declares its tokens in the stylesheet", (id) => {
    expect(Object.keys(declaredTokens(id))).toContain("--primary");
  });

  it("keeps the accent presets to the accent color alone", () => {
    for (const id of CUSTOM_PRESETS.filter((preset) => THEME_PRESETS[preset].group === "accent")) {
      const declared = declaredTokens(id);
      // Only the accent: no surface, chrome, tab, selection or text token.
      for (const token of [
        "--background", "--foreground", "--card", "--popover", "--muted", "--muted-foreground",
        "--accent", "--secondary", "--control", "--border", "--sidebar", "--sidebar-accent", "--sidebar-border",
      ]) {
        expect(declared, `${id} ${token}`).not.toHaveProperty(token);
      }
    }
  });

  it.each(CUSTOM_PRESETS)("%s: the settings swatch and chrome color mirror its CSS", (id) => {
    const tokens = presetTokens(id);
    const { swatch, chromeColor } = THEME_PRESETS[id];
    expect(tokens["--background"]).toBe(swatch.background);
    expect(tokens["--sidebar"]).toBe(swatch.sidebar);
    expect(tokens["--foreground"]).toBe(swatch.foreground);
    expect(tokens["--primary"]).toBe(swatch.primary);
    // Accent presets keep minddy's chrome, hence its status-bar color.
    expect(chromeColor).toBe(THEME_PRESETS[id].group === "accent"
      ? THEME_PRESETS[`minddy-${THEME_PRESETS[id].mode}`].chromeColor
      : tokens["--sidebar"]);
  });

  it.each(CUSTOM_PRESETS)("%s: text, actions and focus keep WCAG contrast", (id) => {
    const t = presetTokens(id);
    const { highContrast } = THEME_PRESETS[id];
    const text = highContrast ? 7 : 4.5;
    const surfaces = ["--background", "--card", "--popover", "--sidebar", "--muted", "--accent", "--control"];

    for (const surface of surfaces) {
      expect(contrast(t["--foreground"], t[surface]), `foreground on ${surface}`).toBeGreaterThanOrEqual(text);
    }
    for (const surface of ["--background", "--card", "--popover", "--sidebar"]) {
      expect(contrast(t["--muted-foreground"], t[surface]), `muted text on ${surface}`).toBeGreaterThanOrEqual(text);
    }
    expect(contrast(t["--primary-foreground"], t["--primary"]), "primary action").toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["--ring"], t["--background"]), "focus ring").toBeGreaterThanOrEqual(3);
    if (highContrast) {
      expect(contrast(t["--border"], t["--background"]), "borders").toBeGreaterThanOrEqual(3);
    }

    // A translucent menu (84% popover, globals.css) over the worst thing it
    // can float above: the page's own text color.
    const glass = mix(t["--popover"], t["--foreground"], 0.84);
    expect(contrast(t["--foreground"], glass), "text on a translucent menu").toBeGreaterThanOrEqual(4.5);
  });
});

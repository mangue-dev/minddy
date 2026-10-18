"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_THEME_APPEARANCE,
  DEFAULT_THEME_PRESETS,
  isDarkThemePreset,
  isLightThemePreset,
  THEME_PRESET_ATTRIBUTES,
  THEME_TRANSPARENCY_ATTRIBUTE,
  type ThemeAppearance,
} from "./theme-presets";

/**
 * The account's palettes as they stand ON SCREEN (MIN-696).
 *
 * The `<html>` attributes are the single store: the pre-paint script writes
 * them from the proxy's headers, the account sync rewrites them at sign-in,
 * and a settings change writes them optimistically. React reads them back
 * through `useSyncExternalStore`, so there is no second copy to keep in step
 * and no hydration race — the server snapshot is the default appearance, the
 * client one is whatever the pre-paint script installed.
 */

const OBSERVED = [
  THEME_PRESET_ATTRIBUTES.light,
  THEME_PRESET_ATTRIBUTES.dark,
  THEME_TRANSPARENCY_ATTRIBUTE,
];

export function readDocumentAppearance(root: Element): ThemeAppearance {
  const light = root.getAttribute(THEME_PRESET_ATTRIBUTES.light);
  const dark = root.getAttribute(THEME_PRESET_ATTRIBUTES.dark);
  return {
    light: isLightThemePreset(light) ? light : DEFAULT_THEME_PRESETS.light,
    dark: isDarkThemePreset(dark) ? dark : DEFAULT_THEME_PRESETS.dark,
    transparency: root.getAttribute(THEME_TRANSPARENCY_ATTRIBUTE) !== "off",
  };
}

export function applyDocumentAppearance(root: Element, appearance: ThemeAppearance) {
  root.setAttribute(THEME_PRESET_ATTRIBUTES.light, appearance.light);
  root.setAttribute(THEME_PRESET_ATTRIBUTES.dark, appearance.dark);
  root.setAttribute(THEME_TRANSPARENCY_ATTRIBUTE, appearance.transparency ? "on" : "off");
}

/** Leaving the signed-in shell: public pages show the Minddy palettes. */
export function clearDocumentAppearance(root: Element) {
  for (const name of OBSERVED) root.removeAttribute(name);
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: OBSERVED,
  });
  return () => observer.disconnect();
}

// Snapshots must be stable between calls: a string key, parsed once per value.
function snapshot(): string {
  const { light, dark, transparency } = readDocumentAppearance(document.documentElement);
  return `${light}|${dark}|${transparency ? "on" : "off"}`;
}
const SERVER_SNAPSHOT = `${DEFAULT_THEME_APPEARANCE.light}|${DEFAULT_THEME_APPEARANCE.dark}|on`;

function parse(key: string): ThemeAppearance {
  const [light, dark, glass] = key.split("|");
  return {
    light: isLightThemePreset(light) ? light : DEFAULT_THEME_PRESETS.light,
    dark: isDarkThemePreset(dark) ? dark : DEFAULT_THEME_PRESETS.dark,
    transparency: glass !== "off",
  };
}

const parsed = new Map<string, ThemeAppearance>();

export function useDocumentAppearance(): ThemeAppearance {
  const key = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  let value = parsed.get(key);
  if (!value) {
    value = parse(key);
    parsed.set(key, value);
  }
  return value;
}

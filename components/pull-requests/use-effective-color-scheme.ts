"use client";

import { useEffect, useState } from "react";
import { useTheme } from "mangue-ui";

type ColorScheme = "light" | "dark";

function documentColorScheme(fallback: ColorScheme): ColorScheme {
  const root = document.documentElement;
  const scheme = getComputedStyle(root).colorScheme;
  if (root.classList.contains("dark") || scheme.startsWith("dark")) return "dark";
  if (root.classList.contains("light") || scheme.startsWith("light")) return "light";
  return fallback;
}

/**
 * Keep Shadow DOM renderers aligned with the theme actually painted by the app.
 * The theme context is the normal source, while the document observer also covers
 * account-theme hydration and browser-driven changes that update the root first.
 */
export function useEffectiveColorScheme(): ColorScheme {
  const { resolvedTheme } = useTheme();
  const [scheme, setScheme] = useState<ColorScheme>(resolvedTheme);

  useEffect(() => {
    const sync = () => setScheme(documentColorScheme(resolvedTheme));
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", sync);
    };
  }, [resolvedTheme]);

  return scheme;
}

"use client";

import { useEffect, useSyncExternalStore } from "react";

import { isMobileLayout, subscribeAppLayout } from "./app-layout";

export { MOBILE_LAYOUT_QUERY } from "./app-layout";
const serverSnapshot = () => undefined;

/** Resolve the viewport before mounting anything that writes desktop tabs. */
export function useMobileLayout() {
  return useSyncExternalStore(subscribeAppLayout, isMobileLayout, serverSnapshot);
}

/** Keep sheets above the software keyboard on browsers with a visual viewport. */
export function useMobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--mobile-viewport-height", `${viewport.height}px`);
      root.style.setProperty("--mobile-keyboard-inset", `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--mobile-viewport-height");
      root.style.removeProperty("--mobile-keyboard-inset");
    };
  }, []);
}

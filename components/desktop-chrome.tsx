"use client";

import { useEffect } from "react";

import { getDesktopBridge } from "@/lib/desktop/bridge";
import { useAffirmWindowButtons } from "@/lib/use-window-buttons";
import { startDesktopTrace } from "@/lib/desktop/trace";

/**
 * Marks the document when it is rendered IN the desktop app (MIN-291).
 *
 * Only one thing depends on it, and it cannot be done otherwise: **the
 * areas through which the window is moved**. The native title bar is
 * hidden (`titleBarStyle: "hiddenInset"`), so that the app does not have a band
 * gray above its own header; in exchange, macOS no longer knows where
 * enter it, and it's up to the page to say it — `-webkit-app-region: drag` is a
 * CSS property, it can only come from here. Without it, the window will not move
 * not at all: this was the case on the first try.
 *
 * The attribute is set to `<html>` by an effect, never when rendered: the bridge
 * does not exist on the server side, and assuming it does would cause hydration to diverge. THE
 * Rules that read it live in app/globals.css, "desktop app" section.
 *
 * He carries a second thing, for the same reason that he carries the first: he
 * is mounted in the ROOT layout, therefore on all screens — the connection, `/f/`,
 * `/p/`, including page 404. This is what allows him to reaffirm by hand
 * process what the document wants macOS fires (MIN-304); the component which
 * draws them, he only lives under the authenticated app.
 */
export function DesktopChrome() {
  useAffirmWindowButtons();

  useEffect(() => {
    if (!getDesktopBridge()) return;
    const root = document.documentElement;
    root.setAttribute("data-desktop-app", "");
    return () => root.removeAttribute("data-desktop-app");
  }, []);

  // The trace of MIN-307, turned off by default: it is only installed with
  // `localStorage.minddy.trace = "1"`, and only in the shell. Rise
  // here because it is the component that already guarantees both conditions.
  useEffect(() => startDesktopTrace(), []);

  return null;
}

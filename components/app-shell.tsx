"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/** Target of the skip link: the shell's scrollable content region. */
export const MAIN_CONTENT_ID = "main-content";

/**
 * WCAG 2.4.1: the first Tab stop of the signed-in app, before the top bar and
 * the sidebar, jumps to the content. Focus moves without touching the URL
 * hash, which the tab router and `?issue=` links own.
 */
export function SkipToContentLink() {
  const t = useTranslations("Nav");
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={(event) => {
        event.preventDefault();
        document.getElementById(MAIN_CONTENT_ID)?.focus();
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-2 focus:outline-ring"
    >
      {t("skipToContent")}
    </a>
  );
}

/** When the command palette last asked for the next navigation to focus the content. */
let mainFocusRequestedAt = Number.NEGATIVE_INFINITY;
/** How long a palette request waits for the navigation it started. */
const MAIN_FOCUS_REQUEST_TTL_MS = 5_000;

/** The palette is about to navigate: focus the content once the route changes. */
export function requestMainFocusOnNavigation() {
  mainFocusRequestedAt = performance.now();
}

/**
 * WCAG 2.4.3: after a navigation started from the sidebar or the command
 * palette, focus moves to `<main>`, so the next Tab reaches the new view
 * instead of the rest of the sidebar. Focus already inside the content, in
 * the tab strip or in a surface the view opened is left where it is.
 */
export function useMainFocusOnNavigation(location: string) {
  const previous = React.useRef(location);
  React.useEffect(() => {
    if (previous.current === location) return;
    previous.current = location;
    const requested = performance.now() - mainFocusRequestedAt < MAIN_FOCUS_REQUEST_TTL_MS;
    mainFocusRequestedAt = Number.NEGATIVE_INFINITY;
    const active = document.activeElement;
    const fromNavigation = !active || active === document.body || active.closest("[data-sidebar-navigation]") !== null;
    if (!requested && !fromNavigation) return;
    const frame = requestAnimationFrame(() => {
      const main = document.getElementById(MAIN_CONTENT_ID);
      const current = document.activeElement;
      // The new view focused a field of its own: keep it.
      if (!main || (current && current !== main && current !== active && main.contains(current))) return;
      main.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [location]);
}

export interface AppShellProps {
  /** A <Sidebar/>. Automatically hidden below the `desktop` breakpoint. */
  sidebar?: React.ReactNode;
  /** A <Header/>. */
  header?: React.ReactNode;
  /** A <MobileNav/>, shown only below the `desktop` breakpoint. */
  mobileNav?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * The assembled application layout: fixed-height row of [nav | (header +
 * scrollable main)], with an optional mobile bottom nav. Responsive behaviour:
 * the sidebar is desktop-only (>=1200px), the mobile nav takes over below it.
 */
export function AppShell({
  sidebar,
  header,
  mobileNav,
  children,
  className,
}: AppShellProps) {
  // Lock document scroll while the shell owns the viewport (all scrolling is
  // handled by the inner <main>) and, on ultrawide (≥3xl), center the shell as a
  // card with an aurora canvas behind it — the body becomes the centering
  // context since the `mx-auto` alone can't center vertically. Everything is
  // restored on unmount / when leaving the ultrawide range.
  React.useEffect(() => {
    const body = document.body;
    const root = document.documentElement;
    const prevOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    const mq = window.matchMedia("(min-width: 2200px)");
    const apply = (ultrawide: boolean) => {
      if (ultrawide) {
        root.style.height = "100dvh";
        body.style.height = "100dvh";
        body.style.display = "flex";
        body.style.alignItems = "center";
        body.style.justifyContent = "center";
        body.classList.add("ultrawide-canvas");
      } else {
        root.style.height = "";
        body.style.height = "";
        body.style.display = "";
        body.style.alignItems = "";
        body.style.justifyContent = "";
        body.classList.remove("ultrawide-canvas");
      }
    };
    apply(mq.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener("change", onChange);

    return () => {
      body.style.overflow = prevOverflow;
      root.style.height = "";
      body.style.height = "";
      body.style.display = "";
      body.style.alignItems = "";
      body.style.justifyContent = "";
      body.classList.remove("ultrawide-canvas");
      mq.removeEventListener("change", onChange);
    };
  }, []);

  return (
    <div
      className={cn(
        "flex h-dvh w-full overflow-hidden bg-background text-foreground",
        // Ultrawide: become a centered card with a max width/height, rounded
        // corners, border and elevation — the canvas shows through around it.
        "3xl:mx-auto 3xl:max-h-[var(--spacing-app-max-h)] 3xl:max-w-[var(--spacing-app-max-w)] 3xl:rounded-[30px] 3xl:border 3xl:border-border 3xl:shadow-2xl",
        className,
      )}
    >
      {sidebar ? (
        <div className="hidden h-full shrink-0 desktop:flex">{sidebar}</div>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {header}
        <main
          id={MAIN_CONTENT_ID}
          // Focusable by script only, for the skip link.
          tabIndex={-1}
          // No reserve for the mobile pill: content scrolls under it, and each
          // page's scrolling column ends with its room (app/globals.css).
          className="min-h-0 flex-1 overflow-y-auto outline-none"
        >
          {children}
        </main>
      </div>
      {mobileNav}
    </div>
  );
}

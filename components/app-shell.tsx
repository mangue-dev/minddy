"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

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
          className={cn(
            "min-h-0 flex-1 overflow-y-auto",
            // Reserve space at the bottom on mobile so page content clears the
            // floating <MobileNav> pill instead of scrolling under it. Only when
            // a mobileNav is actually provided, and only below the desktop
            // breakpoint where the pill is shown.
            mobileNav &&
              "max-desktop:pb-[calc(6rem+env(safe-area-inset-bottom))]",
          )}
        >
          {children}
        </main>
      </div>
      {mobileNav}
    </div>
  );
}

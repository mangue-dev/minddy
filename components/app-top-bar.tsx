"use client";
import { useLayoutEffect } from "react";
import { useWindowButtonsSlot, useWideLayout } from "@/lib/use-window-buttons";
import { appTopBarNavigationWidth } from "@/lib/app-chrome-layout";
import { SidebarVisibilityButton } from "./sidebar-visibility-button";
import { AppTopActions } from "./app-top-actions";
import { AppTabStrip } from "./app-tab-strip";
import { AppUpdateAction } from "./app-update-action";
import { WINDOW_BUTTONS_WIDTH } from "./desktop-window-buttons";
import type { AppNavItem } from "./app-sidebar";

type AppTopBarProps = {
  hidden: boolean;
  inbox: AppNavItem;
  onSearch: () => void;
  onSearchWarm: () => void;
  onNewTab: () => void;
};

export function AppTopBar({ ready, ...props }: AppTopBarProps & { ready: boolean }) {
  // Reserve the desktop height before authentication and tab restoration finish.
  return <div className="app-top-bar relative z-40 hidden h-11 shrink-0 items-center bg-sidebar text-sidebar-foreground app-desktop:flex">
    {ready && <AppTopBarContents {...props} />}
  </div>;
}

function AppTopBarContents({ hidden, inbox, onSearch, onSearchWarm, onNewTab }: AppTopBarProps) {
  // Track bar presence once rather than matching a root :has() on every mutation.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-app-top-bar");
    root.setAttribute("data-app-top-bar", "");
    return () => {
      if (previous === null) root.removeAttribute("data-app-top-bar");
      else root.setAttribute("data-app-top-bar", previous);
    };
  }, []);
  const native = useWindowButtonsSlot(useWideLayout());
  const width = appTopBarNavigationWidth(hidden);
  return <div className="app-titlebar-safe-area flex min-w-0 flex-1 items-center">
    <div style={{ width }}
      className="flex h-11 shrink-0 items-center gap-1 px-[10px]">
      {native.reserved && <div aria-hidden className="shrink-0" style={{ width: WINDOW_BUTTONS_WIDTH - 10 }} />}
      <SidebarVisibilityButton collapsed />
      <AppTopActions collapsed={false} inbox={inbox} onSearch={onSearch} onSearchWarm={onSearchWarm} />
    </div>
    <AppTabStrip onNewTab={onNewTab} onNewTabWarm={onSearchWarm} />
    <div className="app-update-slot mr-2 w-fit shrink-0"><AppUpdateAction collapsed={false} compact /></div>
  </div>;
}

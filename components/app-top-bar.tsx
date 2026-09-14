"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useWindowButtonsSlot, useWideLayout } from "@/lib/use-window-buttons";
import { transitions } from "@/lib/motion";
import { appTopBarNavigationWidth } from "@/lib/app-chrome-layout";
import { SidebarVisibilityButton } from "./sidebar-visibility-button";
import { AppTopActions } from "./app-top-actions";
import { AppTabStrip } from "./app-tab-strip";
import { AppUpdateAction } from "./app-update-action";
import { WINDOW_BUTTONS_WIDTH } from "./desktop-window-buttons";
import type { AppNavItem } from "./app-sidebar";

export function AppTopBar({ hidden, secondary, inbox, onSearch, onSearchWarm, onNewTab }: {
  hidden: boolean;
  secondary: boolean;
  inbox: AppNavItem;
  onSearch: () => void;
  onSearchWarm: () => void;
  onNewTab: () => void;
}) {
  const reduce = useReducedMotion();
  const native = useWindowButtonsSlot(useWideLayout());
  const width = appTopBarNavigationWidth(hidden, secondary);
  return <div className="app-top-bar relative z-40 hidden h-11 shrink-0 items-center border-b border-border bg-sidebar text-sidebar-foreground desktop:flex">
    <div className="app-titlebar-safe-area flex min-w-0 flex-1 items-center">
      <motion.div initial={{ width }} animate={{ width }} transition={reduce ? { duration: 0 } : transitions.shell}
        className="flex h-11 shrink-0 items-center gap-1 px-[10px]">
        {native.reserved && <div aria-hidden className="shrink-0" style={{ width: WINDOW_BUTTONS_WIDTH - 10 }} />}
        <SidebarVisibilityButton collapsed />
        <AppTopActions collapsed={false} inbox={inbox} onSearch={onSearch} onSearchWarm={onSearchWarm} />
      </motion.div>
      <AppTabStrip onNewTab={onNewTab} onNewTabWarm={onSearchWarm} />
      <div className="app-update-slot mr-2 w-fit shrink-0"><AppUpdateAction collapsed={false} compact /></div>
    </div>
  </div>;
}

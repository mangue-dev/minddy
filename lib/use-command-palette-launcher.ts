"use client";

import { useEffect, useRef } from "react";
import { useAnalytics } from "@/lib/use-analytics";
import { useBulkActions } from "@/lib/bulk-actions-context";
import { commandPaletteShortcut } from "@/lib/command-palette-shortcut";

/**
 * Keep palette launch gestures in the eager shell while the full search and
 * action UI remains code-split until its first use.
 */
export function useCommandPaletteLauncher({
  open,
  onOpenChange,
  onNewTab,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ⌘T: open the palette in new-tab (destination) mode, like the tab-bar button. */
  onNewTab?: () => void;
}) {
  const { track } = useAnalytics();
  const { openSignal } = useBulkActions();
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = commandPaletteShortcut(event);
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut === "newTab") {
        if (onNewTab) {
          track("command_palette_opened", { source: "new_tab_shortcut" });
          onNewTab();
        }
        return;
      }
      if (!openRef.current) {
        track("command_palette_opened", { source: "shortcut" });
      }
      onOpenChange(shortcut === "toggle" ? !openRef.current : true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, onNewTab, track]);

  useEffect(() => {
    if (openSignal > 0) onOpenChange(true);
  }, [openSignal, onOpenChange]);
}

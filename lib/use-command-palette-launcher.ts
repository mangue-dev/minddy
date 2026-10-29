"use client";

import { useEffect, useRef } from "react";
import { useAnalytics } from "@/lib/use-analytics";
import { useBulkActions } from "@/lib/bulk-actions-context";
import { commandPaletteShortcut } from "@/lib/command-palette-shortcut";
import { usePalettePickerStore } from "@/lib/palette-picker";

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
  const { openSignal, openSelectionActions } = useBulkActions();
  // A content picker (MIN-844) opens the palette even before its code loads.
  const pickerSignal = usePalettePickerStore((state) => state.openSignal);
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
      // With tickets selected, ⌘K opens the selection's actions (the same
      // palette in its bulk mode) rather than the search.
      if (!openRef.current && openSelectionActions()) return;
      if (!openRef.current) {
        track("command_palette_opened", { source: "shortcut" });
      }
      onOpenChange(!openRef.current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, onNewTab, track, openSelectionActions]);

  useEffect(() => {
    if (openSignal > 0) onOpenChange(true);
  }, [openSignal, onOpenChange]);

  // Handled once per picker: a new `onOpenChange` must not reopen it.
  const handledPickerSignal = useRef(pickerSignal);
  useEffect(() => {
    if (pickerSignal === handledPickerSignal.current) return;
    handledPickerSignal.current = pickerSignal;
    onOpenChange(true);
  }, [pickerSignal, onOpenChange]);
}

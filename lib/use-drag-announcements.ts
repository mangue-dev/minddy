"use client";

import { useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import type { Announcements, UniqueIdentifier } from "@dnd-kit/core";

/**
 * Screen-reader feedback for a dnd-kit drag that names the items. The default
 * announcements read the raw IDs (UUIDs for issues, views or columns) and are
 * English only; pass these to `DndContext accessibility={{ announcements }}`.
 * `labelOf` returns the visible name of a draggable or drop target.
 */
export function useDragAnnouncements(
  labelOf: (id: UniqueIdentifier) => string | null | undefined,
): Announcements {
  const t = useTranslations("DragAnnouncements");
  // The latest names, without rebuilding the announcements on every render.
  const label = useRef(labelOf);
  label.current = labelOf;
  return useMemo(() => {
    const name = (id: UniqueIdentifier) => label.current(id) || t("unnamedItem");
    return {
      onDragStart: ({ active }) => t("pickedUp", { item: name(active.id) }),
      onDragOver: ({ active, over }) => over
        ? t("over", { item: name(active.id), target: name(over.id) })
        : t("notOver", { item: name(active.id) }),
      onDragEnd: ({ active, over }) => over
        ? t("dropped", { item: name(active.id), target: name(over.id) })
        : t("droppedNowhere", { item: name(active.id) }),
      onDragCancel: ({ active }) => t("cancelled", { item: name(active.id) }),
    };
  }, [t]);
}

/**
 * What a board card's focus stop actually offers. Without them dnd-kit reads
 * its English default, "press space bar to pick up", and the boards have no
 * keyboard drag: the card opens instead, and its buttons change its fields.
 */
export function useBoardCardInstructions(): { draggable: string } {
  const t = useTranslations("DragAnnouncements");
  return useMemo(() => ({ draggable: t("cardInstructions") }), [t]);
}

/**
 * Localized instructions for a strip's `DndContext`, in place of dnd-kit's
 * English default that a sortable's `aria-describedby` points to (3.1.2).
 * Each strip says what it actually offers: tabs move with Alt+Shift+arrows,
 * views only by mouse.
 */
export function useStripInstructions(kind: "tab" | "view"): { draggable: string } {
  const t = useTranslations("DragAnnouncements");
  const text = kind === "tab" ? t("tabInstructions") : t("viewInstructions");
  return useMemo(() => ({ draggable: text }), [text]);
}

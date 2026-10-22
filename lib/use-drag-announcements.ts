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

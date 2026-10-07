"use client";

import { useEffect, useRef, useState } from "react";
import { useBulkActions } from "@/lib/bulk-actions-context";

/** Handle each selection launch once, even when the palette changes mode. */
export function useBulkPaletteMode({
  open,
  destinationOnly,
  onOpenChange,
}: {
  open: boolean;
  destinationOnly: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { request, openSignal, consumeOpenSignal } = useBulkActions();
  const [bulkMode, setBulkMode] = useState(false);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (wasOpen.current && !open) setBulkMode(false);
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (destinationOnly || !consumeOpenSignal(openSignal)) return;
    onOpenChange(true);
    setBulkMode(true);
  }, [openSignal, consumeOpenSignal, destinationOnly, onOpenChange]);

  return !destinationOnly && bulkMode && !!request;
}

"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!open) setBulkMode(false);
  }, [open]);

  useEffect(() => {
    if (destinationOnly || !consumeOpenSignal(openSignal)) return;
    onOpenChange(true);
    setBulkMode(true);
  }, [openSignal, consumeOpenSignal, destinationOnly, onOpenChange]);

  return !destinationOnly && bulkMode && !!request;
}

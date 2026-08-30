"use client";

import { useEffect, useState } from "react";

import {
  getDesktopBridge,
  type DesktopBridge,
} from "@/lib/desktop/bridge";

/** Subscribe when supported, while remaining compatible with older shells. */
export function subscribeWindowsStoreUpdate(
  bridge: Pick<DesktopBridge, "onWindowsStoreUpdateStatus"> | null,
  handler: (available: boolean) => void
): () => void {
  return bridge?.onWindowsStoreUpdateStatus?.(handler) ?? (() => {});
}

/** Follow Microsoft Store update availability when the installed shell supports it. */
export function useWindowsStoreUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    return subscribeWindowsStoreUpdate(getDesktopBridge(), setAvailable);
  }, []);

  return available;
}

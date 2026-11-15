"use client";

import { useEffect, useState } from "react";

import { getDesktopBridge } from "@/lib/desktop/bridge";

/** Follow Microsoft Store update availability when the installed shell supports it. */
export function useWindowsStoreUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => getDesktopBridge()?.onWindowsStoreUpdateStatus?.(setAvailable), []);

  return available;
}

"use client";

import { useCallback, useEffect, useState } from "react";

import { getDesktopBridge } from "@/lib/desktop/bridge";
import type { DesktopWindowMaterialState } from "@/lib/desktop/window-material";

/**
 * The desktop window material in a component (MIN-810).
 *
 * `null` in the browser, during server rendering and in shells released before
 * the material existed: the caller renders nothing for it. The subscription
 * replays the current state, so no separate read is needed on mount.
 */
export function useDesktopWindowMaterial(): {
  state: DesktopWindowMaterialState | null;
  setEnabled: (enabled: boolean) => void;
} {
  const [state, setState] = useState<DesktopWindowMaterialState | null>(null);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.onWindowMaterialChange) return;
    return bridge.onWindowMaterialChange(setState);
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    const bridge = getDesktopBridge();
    if (!bridge?.setWindowMaterialEnabled) return;
    setState((current) => (current ? { ...current, enabled } : current));
    void bridge.setWindowMaterialEnabled(enabled).then(setState, () => {});
  }, []);

  return { state, setEnabled };
}

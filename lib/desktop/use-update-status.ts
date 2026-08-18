"use client";

import { useEffect, useState } from "react";

import { getDesktopBridge } from "@/lib/desktop/bridge";
import {
  IDLE_UPDATE_STATUS,
  type DesktopUpdateStatus,
} from "@/lib/desktop/update-status";

/**
 * Where is the shell update, in a component (MIN-353).
 *
 * **Renders `idle` everywhere else**: in the browser there is no bridge, and
 * during server rendering there is no `window`. This is what allows
 * the caller to test nothing other than the state — an update to the
 * shell simply does not exist on the web.
 *
 * ⚠ **We UNSUBSCRIBE.** The bridge returns its unsubscription and it must be returned :
 * a `ipcRenderer.on` left behind survives disassembly, and the sidebar
 * reassembles with each mode toggle. This is the default of PR 48, identical to
 * — a subscription that has not been released is neither visible in the type-check
 * nor on the screen, it accumulates.
 */
export function useDesktopUpdateStatus(): DesktopUpdateStatus {
  const [status, setStatus] = useState<DesktopUpdateStatus>(IDLE_UPDATE_STATUS);

  useEffect(() => {
    // The bridge only reads after editing: the server rendering does not have one, and
    // starting from a different value would cause the first hydration to diverge.
    const bridge = getDesktopBridge();
    if (!bridge) return;
    // The subscription replays the current state by itself (`minddy:update-status-ready`),
    // there is therefore nothing more to ask for during assembly.
    return bridge.onUpdateStatus(setStatus);
  }, []);

  return status;
}

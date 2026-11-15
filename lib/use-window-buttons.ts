"use client";

import { useMobileLayout } from "./use-mobile-layout";
import { useEffect, useState } from "react";

import {
  desktopBridgePlatform,
  getDesktopBridge,
} from "./desktop/bridge";
import { trace } from "./desktop/trace";

/**
 * The macOS window buttons: where they live, and when the bar releases their
 * slot (MIN-291).
 *
 * They are native, drawn over the web view, and stay in place under dialogs,
 * palettes and drawers. Only full screen takes them out of the bar, when
 * macOS moves them to the top of the screen without telling the page: the
 * main process announces it, and the layout follows that announcement.
 */

/** Native window buttons follow the same layout decision as the sidebar. */
export function useWideLayout(): boolean {
  return useMobileLayout() === false;
}

export interface WindowButtonsSlot {
  /** Whether the brand row keeps their slot (the mark then moves right). */
  reserved: boolean;
  /**
   * Whether the window's first state has arrived, for the animation only: the
   * mark slides when the slot opens or closes, but not on the first display,
   * where the slot is closed until the bridge answers.
   */
  ready: boolean;
}

const CLOSED: WindowButtonsSlot = { reserved: false, ready: false };

/**
 * What the surface hosting the buttons keeps in their place. `hosts` says
 * whether this surface hosts them now: the sidebar in the wide layout, the
 * header otherwise (`useWideLayout`). A surface that does not host reserves
 * nothing.
 */
export function useWindowButtonsSlot(hosts = true): WindowButtonsSlot {
  const [visible, setVisible] = useState(false);
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const bridge = macDesktopBridge();
    if (!bridge) return;
    return bridge.onWindowButtons((next) => {
      trace("wb:state", { visible: next });
      setVisible(next);
      setStarted(true);
    });
  }, []);

  // The transition is armed two frames after the first position is painted:
  // declared in the same render, it would animate that first position.
  useEffect(() => {
    if (!started) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [started]);

  if (!hosts) return CLOSED;
  return { reserved: visible, ready };
}

function macDesktopBridge() {
  const bridge = getDesktopBridge();
  if (!bridge || typeof navigator === "undefined") return null;
  return desktopBridgePlatform(bridge, navigator.platform) === "darwin"
    ? bridge
    : null;
}

"use client";

import { useMobileLayout } from "./use-mobile-layout";
import { useEffect, useState } from "react";

import {
  desktopBridgePlatform,
  getDesktopBridge,
} from "./desktop/bridge";
import { trace } from "./desktop/trace";

/**
 * macOS buttons: where they live, and when the bar releases their slot
 * (MIN-291).
 *
 * **Whether they show is announced by the main process, it cannot be
 * guessed.** The page never asks to hide them: dialogs, palettes and drawers
 * leave them in place — they are native, drawn over the web view, and the
 * window stays manipulable while a modal is open. What can still take them
 * out of the bar is FULL SCREEN, where macOS carries them to the top of the
 * screen under its own custody, without warning anyone. A layout connected to
 * the request rather than on the result would leave a hole as soon as we
 * switch to full screen; it follows the result, and this file reads it.
 */

/** Native window buttons follow the same layout decision as the sidebar. */
export function useWideLayout(): boolean {
  return useMobileLayout() === false;
}

/* ─── Who hosts the buttons ────────────────────── ────────────────────── */

export interface WindowButtonsSlot {
  /** Does the brand line keep their place? (the mark goes to the right) */
  reserved: boolean;
  /**
   * Have we received the first state of the window?
   *
   * For ANIMATION only: the mark slides from one edge to the other when the
   * place opens or closes (full screen), and it must not
   * slides at the very first display — before the bridge responds, the place is worth
   * “closed” by default, and animating this catch-up would start the app on
   * un logo qui traverse sa barre.
   */
  ready: boolean;
}

const CLOSED: WindowButtonsSlot = { reserved: false, ready: false };

/**
 * What the surface that hosts them should display in their place.
 *
 * `hosts`: is this surface the one that welcomes them at the moment? There
 * sidebar in desktop layout, header in mobile layout — see
 * `useWideLayout`. A surface that does not host reserves nothing.
 *
 * The place simply follows the state announced by the main process: in full
 * screen macOS takes the buttons to the top of the screen, the bar
 * releases their slot until they are reported back, and it comes back to
 * the return. There is no other movement: a dialog, a palette or a
 * drawer never asks for their removal — the window stays manipulable
 * what covers it.
 */
export function useWindowButtonsSlot(hosts = true): WindowButtonsSlot {
  const [visible, setVisible] = useState(false);
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const bridge = macDesktopBridge();
    if (!bridge) return;
    // The current state is replayed upon subscription: the window can be in full
    // screen when loading, and then no one would have anything to announce.
    return bridge.onWindowButtons((next) => {
      trace("wb:state", { visible: next });
      setVisible(next);
      setStarted(true);
    });
  }, []);

  /**
   * The animation sets one FRAME AFTER the first position, never with it.
   *
   * A transition starts when it is declared at the time the property
   * change: putting the duration and the arrival position in the same rendering would
   * drag mark when starting the app, what this flag is precisely
   * there to avoid. Two `requestAnimationFrame` — the first leaves React
   * paint the position, the second arms the movement for the SUITE.
   */
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

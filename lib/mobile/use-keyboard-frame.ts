"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { getMobileBridge } from "@/lib/mobile/bridge";

/** Below this, a smaller visual viewport is browser chrome, not a keyboard. */
const KEYBOARD_MIN_HEIGHT = 120;

export interface KeyboardFrame {
  /** The part of the screen the keyboard leaves, in CSS pixels; null without a keyboard. */
  height: number | null;
  /** Where that part starts, when the browser scrolled the page under it. */
  top: number;
  /** How long the keyboard takes to move, in milliseconds. */
  duration: number;
}

/**
 * The part of the screen above the software keyboard (MIN-907), for the
 * screens that keep their action right above it: sign-in, sign-up and the
 * mobile app's server choice. The visual viewport says it once the keyboard
 * has stopped; the mobile shell says it as the keyboard starts to move.
 */
export function useKeyboardFrame(): KeyboardFrame {
  const [frame, setFrame] = useState<KeyboardFrame>({ height: null, top: 0, duration: 0 });

  useEffect(() => {
    const viewport = window.visualViewport;
    let shellDuration = 0;
    const read = () => {
      if (!viewport) return;
      const covered = window.innerHeight - viewport.height;
      setFrame((current) => {
        const next: KeyboardFrame = covered >= KEYBOARD_MIN_HEIGHT
          ? { height: viewport.height, top: viewport.offsetTop, duration: shellDuration }
          : { height: null, top: 0, duration: shellDuration };
        return current.height === next.height && current.top === next.top ? current : next;
      });
    };
    viewport?.addEventListener("resize", read);
    viewport?.addEventListener("scroll", read);

    const shell = getMobileBridge()?.shell;
    const handle = shell?.addListener?.("keyboard", ({ height, duration }) => {
      shellDuration = duration;
      setFrame({
        height: height >= KEYBOARD_MIN_HEIGHT ? window.innerHeight - height : null,
        top: 0,
        duration,
      });
    });

    read();
    return () => {
      viewport?.removeEventListener("resize", read);
      viewport?.removeEventListener("scroll", read);
      if (handle) void Promise.resolve(handle).then((listener) => listener.remove(), () => {});
    };
  }, []);

  return frame;
}

/**
 * Lays a full-screen column over the part the keyboard leaves: its content,
 * centered, rises with the keyboard and comes back down with it.
 *
 * `insetInline` is where the column's sides stand once it is fixed, which
 * takes it out of its parent's padding: a column whose parent clears the side
 * insets passes the same clearance, or it moves sideways as the keyboard
 * opens.
 */
export function keyboardFrameStyle(
  frame: KeyboardFrame,
  insetInline: CSSProperties["insetInline"] = 0,
): CSSProperties | undefined {
  if (frame.height === null) return undefined;
  return {
    position: "fixed",
    insetInline,
    // Between those sides: a `w-full` column kept its full width and moved
    // right by its left inset.
    width: "auto",
    top: frame.top,
    height: frame.height,
    minHeight: 0,
    transition: frame.duration ? `height ${frame.duration}ms ease-out` : undefined,
  };
}

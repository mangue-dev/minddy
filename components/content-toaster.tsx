"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Toaster } from "sonner";
import { isTextCut } from "@/components/ui/truncated-text";

/** One toast surface for both breakpoints, anchored outside the scrolling main. */
export function ContentToaster() {
  const anchor = useRef<HTMLSpanElement>(null);
  const [pane, setPane] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setPane(anchor.current?.closest("main")?.parentElement ?? null);
    // Retire snapshots left by the removed error-history feature without opening them.
    try {
      window.localStorage.removeItem("minddy:status-errors");
    } catch {
      // Optional device storage can be unavailable in private browsing.
    }
  }, []);

  return (
    <>
      <span ref={anchor} hidden />
      {pane && createPortal(
        <Toaster
          className="content-toaster"
          position="bottom-center"
          visibleToasts={1}
          closeButton
        />,
        pane,
      )}
      {pane && <ToastOverflowTooltip pane={pane} />}
    </>
  );
}

const TOAST_TEXT = ".content-toaster [data-title], .content-toaster [data-description]";
const VIEWPORT_GUTTER = 10;

/**
 * The pill keeps a toast on one line and ellipsizes its text. Sonner renders
 * the text itself, so a `TruncatedText` cannot wrap it: hovering a cut title
 * or description shows the full text in a bubble styled like `TooltipContent`.
 */
function ToastOverflowTooltip({ pane }: { pane: HTMLElement }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<{ left: number; bottom: number } | null>(null);
  const bubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const over = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const text = (event.target as Element | null)?.closest?.(TOAST_TEXT);
      if (text instanceof HTMLElement && isTextCut(text)) setTarget(text);
    };
    const out = (event: PointerEvent) => {
      const text = (event.target as Element | null)?.closest?.(TOAST_TEXT);
      if (text && !text.contains(event.relatedTarget as Node | null)) setTarget(null);
    };
    pane.addEventListener("pointerover", over);
    pane.addEventListener("pointerout", out);
    return () => {
      pane.removeEventListener("pointerover", over);
      pane.removeEventListener("pointerout", out);
    };
  }, [pane]);

  // The toast slides in and is removed without a pointerout, so the bubble
  // follows its text each frame and closes once the text leaves the page.
  useEffect(() => {
    if (!target) {
      setPosition(null);
      return;
    }
    let frame = 0;
    const follow = () => {
      if (!target.isConnected) {
        setTarget(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      const width = bubble.current?.offsetWidth ?? 0;
      const half = width / 2;
      const center = Math.min(
        Math.max(rect.left + rect.width / 2, VIEWPORT_GUTTER + half),
        window.innerWidth - VIEWPORT_GUTTER - half,
      );
      setPosition((previous) => {
        const next = { left: center - half, bottom: window.innerHeight - rect.top + 8 };
        return previous && previous.left === next.left && previous.bottom === next.bottom ? previous : next;
      });
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [target]);

  if (!target) return null;
  return createPortal(
    <div
      ref={bubble}
      role="tooltip"
      data-slot="tooltip-content"
      className="pointer-events-none fixed z-[1210] max-w-[320px] rounded-md bg-foreground px-2.5 py-2 text-left text-xs leading-snug text-background [overflow-wrap:anywhere] animate-in fade-in-0 zoom-in-95"
      style={position ? { left: position.left, bottom: position.bottom } : { visibility: "hidden", left: 0, bottom: 0 }}
    >
      {target.textContent}
    </div>,
    document.body,
  );
}

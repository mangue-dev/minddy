"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Toaster } from "sonner";

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
    </>
  );
}

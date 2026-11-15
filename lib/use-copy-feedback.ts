"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { writeClipboardText } from "@/lib/clipboard";

export type CopyFeedbackState = "idle" | "copied" | "failed";

/**
 * Copy state of one copy control: writes to the clipboard, then holds
 * "copied" or "failed" for `resetMs` before going back to idle.
 *
 * A repeated click restarts the timer instead of stacking timers, and the
 * button is never disabled while the feedback shows, so a failed copy can be
 * retried at once. The timer is cleared on unmount, since the control can
 * disappear during the feedback window.
 */
export function useCopyFeedback(resetMs = 2000) {
  const [state, setState] = useState<CopyFeedbackState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The clipboard write can settle after unmount; no state or timer then.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      const ok = await writeClipboardText(text);
      if (!mounted.current) return ok;
      if (timer.current !== null) clearTimeout(timer.current);
      setState(ok ? "copied" : "failed");
      timer.current = setTimeout(() => setState("idle"), resetMs);
      return ok;
    },
    [resetMs],
  );

  return { state, copied: state === "copied", failed: state === "failed", copy };
}

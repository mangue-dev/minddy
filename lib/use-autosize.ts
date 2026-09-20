import { useEffect, type RefObject } from "react";

/** Grow a textarea's height to fit its content (capped by any CSS max-height). */
export function useAutosize(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Native sizing participates in the browser's normal layout pass. Reading
    // scrollHeight while a dialog mounts otherwise forces a workspace-wide
    // style flush before its focus and scroll-lock effects have finished.
    if (typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}

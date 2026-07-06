import { useEffect, type RefObject } from "react";

/** Grow a textarea's height to fit its content (capped by any CSS max-height). */
export function useAutosize(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}

"use client";

import {
  useCallback,
  type ComponentPropsWithoutRef,
  type Ref,
  type UIEvent,
} from "react";
import { cn } from "@/lib/utils";
import { useScrollFade } from "@/lib/use-scroll-fade";

type PageScrollProps = ComponentPropsWithoutRef<"div"> & {
  ref?: Ref<HTMLDivElement>;
  /**
   * Whether the edges fade. Off for content whose sticky headers already say
   * that the page continues (the Files tab of a pull request): a mask would
   * fade them too. Edges are still measured, so the fade returns at once.
   */
  fade?: boolean;
};

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

/**
 * The vertical scroller of a page. Its top and bottom edges fade only on the
 * side that has more to scroll, over `--page-scroll-fade`, so every page tells
 * "there is more" the same way. Padding stays with the caller.
 */
export function PageScroll({
  ref,
  fade = true,
  className,
  style,
  onScroll,
  ...props
}: PageScrollProps) {
  const { ref: fadeRef, scrollProps } = useScrollFade<HTMLDivElement>(
    "y",
    "var(--page-scroll-fade)",
  );
  // Stable as long as the caller's ref is: an identity that changes on every
  // render would detach and reattach the node each time (MIN-560).
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      fadeRef(node);
      assignRef(ref, node);
    },
    [fadeRef, ref],
  );
  const measure = scrollProps.onScroll;
  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      measure();
      onScroll?.(event);
    },
    [measure, onScroll],
  );

  return (
    <div
      {...props}
      ref={setRef}
      onScroll={handleScroll}
      style={fade && scrollProps.style ? { ...style, ...scrollProps.style } : style}
      className={cn("min-h-0 flex-1 overflow-y-auto", className)}
    />
  );
}

"use client";

import * as React from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollFade } from "@/lib/use-scroll-fade";

/** The ramp of a menu's edge fade (24px, the overlay's `h-6`). */
export const MENU_FADE = "1.5rem";

/**
 * The scroll-edge fade of a menu: drawn over the rows as sticky children of
 * the scroller (a mask on a surface that is itself the scroller would also
 * fade its background and ring), only on an edge that hides rows, with a
 * chevron at that edge saying more rows wait there. Spread `ref` and
 * `onScroll` on the scroller and render `start` first and `end` last among
 * its children.
 */
export function useMenuScrollFade<T extends HTMLElement>() {
  const { ref, scrollProps, edges } = useScrollFade<T>("y", MENU_FADE);
  return {
    ref,
    onScroll: scrollProps.onScroll,
    start: <MenuScrollFadeEdge edge="start" visible={edges.start} />,
    end: <MenuScrollFadeEdge edge="end" visible={edges.end} />,
  };
}

function MenuScrollFadeEdge({ edge, visible }: { edge: "start" | "end"; visible: boolean }) {
  const anchor = React.useRef<HTMLDivElement>(null);
  // The gradient spans the scroller's padding too, whatever padding a caller set.
  const [inset, setInset] = React.useState({ edge: 0, left: 0, right: 0 });
  React.useLayoutEffect(() => {
    const scroller = anchor.current?.parentElement;
    if (!scroller) return;
    const style = getComputedStyle(scroller);
    const next = {
      edge: parseFloat(edge === "start" ? style.paddingTop : style.paddingBottom) || 0,
      left: parseFloat(style.paddingLeft) || 0,
      right: parseFloat(style.paddingRight) || 0,
    };
    setInset((previous) =>
      previous.edge === next.edge && previous.left === next.left && previous.right === next.right ? previous : next,
    );
  }, [edge]);
  return (
    <div
      ref={anchor}
      aria-hidden
      data-menu-scroll-fade={edge}
      className={cn("pointer-events-none sticky z-10 h-0", edge === "start" ? "top-0" : "bottom-0")}
    >
      <div
        className={cn(
          "absolute flex h-6 justify-center from-popover to-transparent text-muted-foreground transition-opacity duration-150 motion-reduce:transition-none",
          edge === "start" ? "items-start bg-gradient-to-b" : "items-end bg-gradient-to-t",
          visible ? "opacity-100" : "opacity-0",
        )}
        style={{
          left: -inset.left,
          right: -inset.right,
          [edge === "start" ? "top" : "bottom"]: -inset.edge,
        }}
      >
        {edge === "start"
          ? <ChevronUpIcon className="mt-0.5 size-3.5" />
          : <ChevronDownIcon className="mb-0.5 size-3.5" />}
      </div>
    </div>
  );
}

/**
 * The same fade for a transparent scroller inside a surface (a command list,
 * a select viewport): a mask on the scroller fades the rows alone.
 */
export function useListScrollFade<T extends HTMLElement>() {
  return useScrollFade<T>("y", MENU_FADE);
}

/** One ref callback for the fade and a caller's own ref, stable while both are. */
export function useMergedRef<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the refs are the dependencies.
  return React.useCallback((node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.RefObject<T | null>).current = node;
    }
  }, refs);
}

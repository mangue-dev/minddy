import { useCallback, useEffect, useRef, useState, type RefCallback } from "react";

/**
 * Marks the scroll container of a sidebar panel: the level-1 navigation and
 * the list a page teleports into the level-2/3 slot.
 */
export const SIDEBAR_SCROLLER_ATTRIBUTE = "data-sidebar-scroller";

export type SidebarScrollEdges = { start: boolean; end: boolean };

const NO_EDGES: SidebarScrollEdges = { start: false, end: false };

/**
 * The scroller of the panel on screen. During a swap the outgoing panel stays
 * mounted but `inert`, and the hidden level-2/3 panel is `inert` too, so the
 * first marked scroller outside any inert subtree is the visible one.
 */
export function activeSidebarScroller(root: HTMLElement): HTMLElement | null {
  for (const element of root.querySelectorAll<HTMLElement>(`[${SIDEBAR_SCROLLER_ATTRIBUTE}]`)) {
    if (!element.closest("[inert]")) return element;
  }
  return null;
}

/** Whether content remains above (`start`) and below (`end`) the viewport. */
export function sidebarScrollEdges(scroller: HTMLElement | null): SidebarScrollEdges {
  if (!scroller) return NO_EDGES;
  return {
    start: scroller.scrollTop > 1,
    end: scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1,
  };
}

/**
 * Tracks the scroll edges of whichever panel scroller is on screen inside the
 * sidebar's panel area, so its edge fades show only where content continues.
 * The panels swap and the pages teleport their lists in and out, so the
 * scroller is looked up again on every measure rather than held once:
 * scrolling (captured, since scroll does not bubble), a resize of the area,
 * the scroller or its rows, a child added or removed, and a panel turning
 * inert all schedule a measure, at most one per frame.
 */
export function useSidebarScrollEdges<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [edges, setEdges] = useState<SidebarScrollEdges>(NO_EDGES);
  const frameRef = useRef<number | null>(null);

  const ref = useCallback<RefCallback<T>>((element) => {
    // Detaches never update the state; the effect's cleanup disconnects.
    if (element) setNode(element);
  }, []);

  useEffect(() => {
    if (!node) return;
    let observed: Element[] = [];
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => schedule());

    // The rows are observed as well as the scroller: content that grows
    // without adding a node (a row expanding) changes the scroll height but
    // not the scroller's own box.
    function observe(scroller: HTMLElement | null) {
      if (!resize) return;
      const targets: Element[] = [node!, ...(scroller ? [scroller, ...scroller.children] : [])];
      if (targets.length === observed.length && targets.every((target, index) => target === observed[index])) return;
      resize.disconnect();
      for (const target of targets) resize.observe(target);
      observed = targets;
    }

    function measure() {
      const scroller = activeSidebarScroller(node!);
      observe(scroller);
      const next = sidebarScrollEdges(scroller);
      setEdges((previous) =>
        previous.start === next.start && previous.end === next.end ? previous : next,
      );
    }

    function schedule() {
      if (frameRef.current != null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        measure();
      });
    }

    measure();
    node.addEventListener("scroll", schedule, { capture: true, passive: true });
    const mutations = new MutationObserver(schedule);
    mutations.observe(node, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["inert"],
    });
    return () => {
      node.removeEventListener("scroll", schedule, { capture: true });
      mutations.disconnect();
      resize?.disconnect();
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [node]);

  return { ref, edges };
}

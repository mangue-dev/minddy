// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeSidebarScroller,
  sidebarScrollEdges,
  useSidebarScrollEdges,
  type SidebarScrollEdges,
} from "@/lib/use-sidebar-scroll-edges";

afterEach(() => vi.unstubAllGlobals());

/** jsdom has no layout: give a scroller explicit metrics. */
function scroller(metrics: { scrollTop: number; clientHeight: number; scrollHeight: number }) {
  const element = document.createElement("div");
  element.setAttribute("data-sidebar-scroller", "");
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(element, key, { configurable: true, writable: true, value });
  }
  return element;
}

describe("sidebar scroll edges", () => {
  it("fades the bottom only while rows remain below", () => {
    expect(sidebarScrollEdges(scroller({ scrollTop: 0, clientHeight: 100, scrollHeight: 300 })))
      .toEqual({ start: false, end: true });
    expect(sidebarScrollEdges(scroller({ scrollTop: 200, clientHeight: 100, scrollHeight: 300 })))
      .toEqual({ start: true, end: false });
    // A list that does not overflow has no edge to hint at.
    expect(sidebarScrollEdges(scroller({ scrollTop: 0, clientHeight: 100, scrollHeight: 100 })))
      .toEqual({ start: false, end: false });
    expect(sidebarScrollEdges(null)).toEqual({ start: false, end: false });
  });

  it("follows the panel on screen, not the inert one leaving", () => {
    const root = document.createElement("div");
    const leaving = document.createElement("div");
    leaving.setAttribute("inert", "");
    const outgoing = scroller({ scrollTop: 0, clientHeight: 100, scrollHeight: 300 });
    const incoming = scroller({ scrollTop: 0, clientHeight: 100, scrollHeight: 100 });
    leaving.append(outgoing);
    root.append(leaving, incoming);
    expect(activeSidebarScroller(root)).toBe(incoming);
  });

  it("hides the bottom fade once the list is scrolled to its end", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    const list = scroller({ scrollTop: 0, clientHeight: 100, scrollHeight: 300 });
    const seen: SidebarScrollEdges[] = [];
    function Probe() {
      const { ref, edges } = useSidebarScrollEdges<HTMLDivElement>();
      seen.push(edges);
      return createElement("div", {
        ref: (node: HTMLDivElement | null) => {
          if (node && !node.contains(list)) node.append(list);
          ref(node);
        },
      });
    }
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(() => root.render(createElement(Probe)));
      expect(seen.at(-1)).toEqual({ start: false, end: true });
      await act(() => {
        list.scrollTop = 200;
        list.dispatchEvent(new Event("scroll"));
      });
      expect(seen.at(-1)).toEqual({ start: true, end: false });
    } finally {
      await act(() => root.unmount());
      host.remove();
    }
  });
});

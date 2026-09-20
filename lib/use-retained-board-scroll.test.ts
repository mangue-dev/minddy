// @vitest-environment jsdom

import { Activity, act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRetainedBoardScroll } from "./use-retained-board-scroll";

afterEach(() => vi.unstubAllGlobals());

describe("retained board column scroll", () => {
  it("restores after Activity's native clamp and ignores hidden scroll events", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    function Board({ active }: { active: boolean }) {
      const scroll = useRetainedBoardScroll(active);
      return createElement("div", { ...scroll, "data-app-view-active": String(active) },
        createElement(Activity, { mode: active ? "visible" : "hidden", children:
          createElement("div", { "data-board-column-scroller": "" }) }));
    }
    const render = (active: boolean) => root.render(createElement(Board, { active }));
    try {
      await act(() => render(true));
      const column = container.querySelector<HTMLElement>("[data-board-column-scroller]")!;
      await act(() => { column.scrollTop = 180; column.scrollLeft = 7; column.dispatchEvent(new Event("scroll")); });
      await act(() => render(false));
      // jsdom has no layout. Reproduce the native clamp observed in Chromium
      // while preserving the same column node and the real Activity lifecycle.
      await act(() => { column.scrollTop = 0; column.scrollLeft = 0; column.dispatchEvent(new Event("scroll")); });
      await act(() => render(true));
      expect(container.querySelector("[data-board-column-scroller]")).toBe(column);
      expect(column.scrollTop).toBe(180);
      expect(column.scrollLeft).toBe(7);
      column.scrollTop = 40;
      await act(() => render(true));
      expect(column.scrollTop).toBe(40);
    } finally { await act(() => root.unmount()); container.remove(); }
  });

  it("does not transfer an evicted column's offset to a new column node", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    function Board({ active, columnKey }: { active: boolean; columnKey: string }) {
      const scroll = useRetainedBoardScroll(active);
      return createElement("div", { ...scroll, "data-app-view-active": String(active) },
        createElement("div", { key: columnKey, "data-board-column-scroller": "" }));
    }
    try {
      await act(() => root.render(createElement(Board, { active: true, columnKey: "old" })));
      const old = container.querySelector<HTMLElement>("[data-board-column-scroller]")!;
      await act(() => { old.scrollTop = 180; old.dispatchEvent(new Event("scroll")); });
      await act(() => root.render(createElement(Board, { active: false, columnKey: "new" })));
      await act(() => root.render(createElement(Board, { active: true, columnKey: "new" })));
      const current = container.querySelector<HTMLElement>("[data-board-column-scroller]")!;
      expect(current).not.toBe(old);
      expect(current.scrollTop).toBe(0);
    } finally { await act(() => root.unmount()); container.remove(); }
  });
});

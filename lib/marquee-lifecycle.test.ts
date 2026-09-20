// @vitest-environment jsdom

import { Activity, act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { MarqueeOverlay, useMarqueeSelection } from "@/components/marquee-selection";

afterEach(() => vi.unstubAllGlobals());
it("cancels marquee frames and restores text selection when its board suspends", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let nextFrame = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  let controls: ReturnType<typeof useMarqueeSelection<HTMLDivElement>>;
  function Board() {
    controls = useMarqueeSelection<HTMLDivElement>({ selected: new Set(), onChange: vi.fn() });
    return createElement("div", { ref: controls.ref, "data-board": "" },
      createElement(MarqueeOverlay, { overlayRef: controls.overlayRef }));
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (mode: "visible" | "hidden") => root.render(createElement(Activity, { mode, children: createElement(Board) }));
  try {
    await act(() => render("visible"));
    const board = host.querySelector<HTMLElement>("[data-board]")!;
    board.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500 } as DOMRect);
    Object.defineProperties(board, { clientWidth: { value: 500 }, offsetWidth: { value: 500 }, clientHeight: { value: 500 }, offsetHeight: { value: 500 } });
    document.elementFromPoint = () => board;
    await act(() => controls.onPointerDown({ pointerType: "mouse", button: 0, target: board,
      clientX: 50, clientY: 50, preventDefault: vi.fn() } as never));
    await act(() => window.dispatchEvent(new MouseEvent("pointermove", { clientX: 100, clientY: 100 })));
    expect(frames.size).toBe(1);
    expect(document.body.style.userSelect).toBe("none");
    await act(() => render("hidden"));
    expect(frames.size).toBe(0);
    expect(document.body.style.userSelect).toBe("");
    await act(() => render("visible"));
    expect(frames.size).toBe(0);
  } finally { await act(() => root.unmount()); host.remove(); }
});

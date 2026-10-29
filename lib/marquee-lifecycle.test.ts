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

async function scrollDuringGesture(startOn: "column" | "background", windowed = false) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let nextFrame = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const runFrame = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((frame) => frame(0)); };
  const onChange = vi.fn();
  let controls: ReturnType<typeof useMarqueeSelection<HTMLDivElement>>;
  function Board() {
    controls = useMarqueeSelection<HTMLDivElement>({ selected: new Set(), onChange });
    return createElement("div", { ref: controls.ref, "data-board": "" },
      createElement("div", { "data-column": "", style: { overflowY: "auto" } },
        createElement("div", { "data-issue-id": "a" }),
        createElement("div", { "data-issue-id": "b" })),
      createElement(MarqueeOverlay, { overlayRef: controls.overlayRef }));
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const box = (left: number, top: number, right: number, bottom: number) =>
    ({ left, top, right, bottom, width: right - left, height: bottom - top } as DOMRect);
  try {
    await act(() => root.render(createElement(Board)));
    const board = host.querySelector<HTMLElement>("[data-board]")!;
    const column = host.querySelector<HTMLElement>("[data-column]")!;
    // The board spans 0–600; its column 100–500, the rest is background.
    board.getBoundingClientRect = () => box(0, 0, 600, 500);
    column.getBoundingClientRect = () => box(100, 0, 500, 500);
    Object.defineProperties(board, { clientWidth: { value: 600 }, offsetWidth: { value: 600 }, clientHeight: { value: 500 }, offsetHeight: { value: 500 } });
    let scrollTop = 0;
    Object.defineProperties(column, {
      scrollTop: { get: () => scrollTop, set: (value: number) => { scrollTop = value; } },
      scrollHeight: { value: 1000 }, clientHeight: { value: 500 },
    });
    // Card A at 100–140 and card B at 200–240 in the column's content.
    for (const [id, top] of [["a", 100], ["b", 200]] as const) {
      host.querySelector<HTMLElement>(`[data-issue-id="${id}"]`)!.getBoundingClientRect = () =>
        box(120, top - scrollTop, 400, top + 40 - scrollTop);
    }
    document.elementFromPoint = (x: number) => (x < 100 || x > 500 ? board : column);

    const startX = startOn === "column" ? 110 : 50;
    await act(() => controls.onPointerDown({ pointerType: "mouse", button: 0, target: startOn === "column" ? column : board,
      clientX: startX, clientY: 90, preventDefault: vi.fn() } as never));
    await act(() => window.dispatchEvent(new MouseEvent("pointermove", { clientX: 300, clientY: 400 })));
    await act(runFrame);
    expect(onChange).toHaveBeenLastCalledWith(new Set(["a", "b"]));

    // The column scrolls by 150px: card A leaves the view, still in the
    // rectangle as the column's content sees it.
    scrollTop = 150;
    // A long column unmounts the cards the scroll takes far from view.
    if (windowed) host.querySelector('[data-issue-id="a"]')!.remove();
    await act(() => window.dispatchEvent(new Event("scroll")));
    await act(runFrame);
    expect(onChange).toHaveBeenLastCalledWith(new Set(["a", "b"]));
    window.dispatchEvent(new MouseEvent("pointerup"));
  } finally { await act(() => root.unmount()); host.remove(); }
}

it("keeps a card selected when its column's scroll pushes it out of view, as page blocks do", () =>
  scrollDuringGesture("column"));

it("does the same when the rectangle starts on the background beside the columns", () =>
  scrollDuringGesture("background"));

it("keeps a card the windowed column unmounts after the scroll took it away", () =>
  scrollDuringGesture("column", true));

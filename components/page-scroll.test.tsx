// @vitest-environment jsdom
//
// The page scroller fades an edge only while there is more to scroll on that
// side (MIN-985).
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageScroll } from "./page-scroll";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let frames: FrameRequestCallback[] = [];
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const runFrames = () =>
  act(async () => {
    const pending = frames;
    frames = [];
    for (const callback of pending) callback(0);
  });

/** Gives the scroller a fixed geometry that jsdom does not compute. */
function setGeometry(el: HTMLElement, { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: clientHeight });
}

async function scrollTo(el: HTMLElement, top: number) {
  Object.defineProperty(el, "scrollTop", { configurable: true, value: top });
  await act(async () => {
    el.dispatchEvent(new Event("scroll"));
  });
  await runFrames();
}

const mask = (el: HTMLElement) => el.style.maskImage;

async function mount(props: Parameters<typeof PageScroll>[0] = {}) {
  const ref = createRef<HTMLDivElement>();
  await act(async () => root.render(<PageScroll ref={ref} {...props}><p>content</p></PageScroll>));
  const el = ref.current!;
  return el;
}

describe("PageScroll", () => {
  it("fades the bottom only while content remains, the top only once scrolled", async () => {
    const el = await mount();
    setGeometry(el, { scrollHeight: 1000, clientHeight: 400 });
    await scrollTo(el, 0);
    expect(mask(el)).toBe(
      "linear-gradient(to bottom, #000, #000 calc(100% - var(--page-scroll-fade)), transparent)",
    );

    await scrollTo(el, 300);
    expect(mask(el)).toBe(
      "linear-gradient(to bottom, transparent, #000 var(--page-scroll-fade), #000 calc(100% - var(--page-scroll-fade)), transparent)",
    );

    await scrollTo(el, 600);
    expect(mask(el)).toBe(
      "linear-gradient(to bottom, transparent, #000 var(--page-scroll-fade), #000)",
    );
  });

  it("does not fade content that fits", async () => {
    const el = await mount();
    setGeometry(el, { scrollHeight: 400, clientHeight: 400 });
    await scrollTo(el, 0);
    expect(mask(el)).toBe("");
  });

  it("keeps the caller's scroll handler, style and classes", async () => {
    const onScroll = vi.fn();
    const el = await mount({ onScroll, style: { color: "red" }, className: "px-6" });
    setGeometry(el, { scrollHeight: 1000, clientHeight: 400 });
    await scrollTo(el, 300);
    expect(onScroll).toHaveBeenCalled();
    expect(el.style.color).toBe("red");
    expect(mask(el)).not.toBe("");
    expect(el.className).toContain("overflow-y-auto");
    expect(el.className).toContain("px-6");
  });

  it("measures but does not fade when the fade is off", async () => {
    const el = await mount({ fade: false });
    setGeometry(el, { scrollHeight: 1000, clientHeight: 400 });
    await scrollTo(el, 300);
    expect(mask(el)).toBe("");
  });
});

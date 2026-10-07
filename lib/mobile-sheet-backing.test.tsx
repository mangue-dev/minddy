// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { observeMobileSheetBacking } from "./mobile-sheet-backing";
import { useMobileViewport } from "./use-mobile-layout";

let mobile: MediaQueryList;
let stop: (() => void) | undefined;
let onResize: () => void;
let dimensions: { height: number; bottom: number };
const flush = async () => {
  await Promise.resolve();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};
const backing = () => document.querySelector<HTMLElement>("[data-mobile-sheet-backing]");
function sheet(height = 360, color = "rgb(245, 245, 245)", level = 50, slot = "sheet-content") {
  const node = document.createElement("div");
  node.dataset.slot = slot;
  node.dataset.state = "open";
  node.setAttribute("data-mobile-sheet", "");
  node.style.cssText = `background-color: ${color}; z-index: ${level}; border-radius: 24px 24px 0 0;`;
  const size = { height, bottom: 844 };
  Object.defineProperty(node, "offsetHeight", { get: () => size.height });
  node.getBoundingClientRect = () => ({ bottom: size.bottom, height: size.height }) as DOMRect;
  document.body.append(node);
  return { node, size };
}
beforeEach(() => {
  mobile = Object.assign(new EventTarget(), { matches: true }) as MediaQueryList;
  vi.stubGlobal("matchMedia", () => mobile);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { onResize = callback; }
    observe() {} disconnect() {}
  });
  Object.defineProperties(document.documentElement, {
    clientHeight: { configurable: true, value: 844 }, clientWidth: { configurable: true, value: 390 },
  });
  vi.stubGlobal("scrollY", 0);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  dimensions = { height: 360, bottom: 844 };
});
afterEach(() => {
  stop?.(); stop = undefined;
  document.body.replaceChildren();
  document.documentElement.style.cssText = "";
  vi.unstubAllGlobals();
});
function observe() { stop = observeMobileSheetBacking(mobile).destroy; }

it("tracks content height and paints only beneath the lifted sheet", async () => {
  const active = sheet(); dimensions = active.size;
  observe(); await flush();
  expect(backing()?.style).toMatchObject({ height: "360px", width: "390px", top: "484px", clipPath: "inset(360px 0 0 0)" });
  expect(backing()?.nextSibling).toBe(active.node);
  expect(backing()?.getAttribute("aria-hidden")).toBe("true");
  dimensions.height = 280; dimensions.bottom = 500;
  onResize(); await flush();
  expect(backing()?.style).toMatchObject({ height: "344px", top: "500px", clipPath: "inset(0px 0 0 0)" });
  expect(parseFloat(backing()!.style.top) + parseFloat(backing()!.style.height)).toBe(844);
  dimensions.height = 600;
  onResize(); await flush();
  expect(backing()?.style).toMatchObject({ height: "600px", top: "244px", clipPath: "inset(256px 0 0 0)" });
});

it("follows the topmost nested sheet and restores its parent after exit", async () => {
  const parent = sheet(600);
  observe(); await flush();
  const child = sheet(220, "rgb(32, 32, 32)");
  await flush();
  expect(backing()?.style).toMatchObject({ height: "220px", backgroundColor: "rgb(32, 32, 32)", zIndex: "50" });
  expect(backing()?.nextSibling).toBe(child.node);
  child.node.dataset.state = "closed"; child.node.style.animationName = "exit";
  await flush();
  expect(backing()?.dataset.state).toBe("closed");
  child.node.remove(); await flush();
  expect(backing()?.nextSibling).toBe(parent.node);
  expect(backing()?.style.height).toBe("600px");
  parent.node.remove(); await flush();
  expect(backing()).toBeNull();
});

it("respects stacking, confirmation sheets, theme changes and hidden content", async () => {
  const higher = sheet(300, "rgb(255, 255, 255)", 60, "alert-dialog-content");
  higher.node.removeAttribute("data-mobile-sheet");
  const lower = sheet(500);
  observe(); await flush();
  expect(backing()?.nextSibling).toBe(higher.node);
  higher.node.style.backgroundColor = "rgb(20, 20, 20)";
  await flush();
  expect(backing()?.style.backgroundColor).toBe("rgb(20, 20, 20)");
  higher.node.style.visibility = "hidden"; await flush();
  expect(backing()?.nextSibling).toBe(lower.node);
  lower.node.dataset.state = "closed"; await flush();
  expect(backing()).toBeNull();
});

it("keeps its bottom at the layout viewport during document scrolling and orientation changes", async () => {
  sheet(); observe(); await flush();
  vi.stubGlobal("scrollY", 80);
  window.dispatchEvent(new Event("scroll")); await flush();
  expect(backing()?.style.top).toBe("564px");
  Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: 667 });
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 600 });
  window.dispatchEvent(new Event("resize")); await flush();
  expect(backing()?.style).toMatchObject({ top: "387px", width: "600px", height: "360px" });
});

it("accounts for a positioned portal parent without moving the layout anchor", async () => {
  const parent = document.createElement("div"); parent.style.position = "relative";
  parent.getBoundingClientRect = () => ({ top: 120, left: 20 }) as DOMRect;
  document.body.append(parent);
  const active = sheet(); parent.append(active.node);
  observe(); await flush();
  Object.defineProperty(backing()!, "offsetParent", { value: parent });
  onResize(); await flush();
  expect(backing()?.style).toMatchObject({ top: "364px", left: "-20px", height: "360px", width: "390px" });
});

it("removes the backing at desktop widths and cancels pending work on disposal", async () => {
  sheet(); observe(); await flush();
  Object.assign(mobile, { matches: false }); mobile.dispatchEvent(new Event("change")); await flush();
  expect(backing()).toBeNull();
  Object.assign(mobile, { matches: true }); mobile.dispatchEvent(new Event("change")); await flush();
  expect(backing()).not.toBeNull();
  onResize(); stop?.(); await flush();
  expect(backing()).toBeNull();
});

it("moves the real sheet with the visual viewport while keeping its backing at the layout bottom", async () => {
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 });
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerHeight", 844);
  const active = sheet(600);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  function Harness() { useMobileViewport(); return null; }
  await act(() => root.render(<Harness />)); await flush();
  Object.assign(viewport, { height: 480, offsetTop: 40 }); active.size.bottom = 520;
  await act(() => viewport.dispatchEvent(new Event("resize"))); await flush();
  expect(document.documentElement.style.getPropertyValue("--mobile-keyboard-inset")).toBe("324px");
  expect(document.documentElement.style.getPropertyValue("--mobile-viewport-height")).toBe("480px");
  expect(backing()?.style).toMatchObject({ top: "244px", height: "600px", clipPath: "inset(276px 0 0 0)" });
  Object.assign(viewport, { height: 844, offsetTop: 0 }); active.size.bottom = 844;
  await act(() => viewport.dispatchEvent(new Event("scroll"))); await flush();
  expect(document.documentElement.style.getPropertyValue("--mobile-keyboard-inset")).toBe("0px");
  expect(backing()?.style.clipPath).toBe("inset(600px 0 0 0)");
  await act(() => root.unmount()); await flush();
  expect(backing()).toBeNull();
  expect(document.documentElement.style.getPropertyValue("--mobile-keyboard-inset")).toBe("");
});

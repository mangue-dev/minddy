// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMobileViewport } from "./use-mobile-layout";

vi.mock("./app-layout", () => ({
  isMobileLayout: () => true,
  subscribeAppLayout: () => () => {},
  MOBILE_LAYOUT_QUERY: "(max-width: 1023px)",
}));

// The geometry iOS 27 Safari reports on an iPhone 18 Pro (MIN-870).
const LAYOUT_HEIGHT = 714;
const KEYBOARD_HEIGHT = 330;

class FakeVisualViewport extends EventTarget {
  height = LAYOUT_HEIGHT;
  offsetTop = 0;
  scale = 1;
}

let viewport: FakeVisualViewport;
let frames: FrameRequestCallback[];
let root: Root;
let container: HTMLElement;
const html = document.documentElement;

function flushFrames() {
  while (frames.length) frames.shift()!(0);
}

function Probe({ pinDocument }: { pinDocument: boolean }) {
  useMobileViewport({ pinDocument });
  return null;
}

function mount(pinDocument = true) {
  act(() => root.render(createElement(Probe, { pinDocument })));
  flushFrames();
}

/** Safari with the keyboard up: innerHeight shrinks too. */
function openKeyboard() {
  viewport.height = LAYOUT_HEIGHT - KEYBOARD_HEIGHT;
  Object.defineProperty(window, "innerHeight", { configurable: true, value: viewport.height });
  viewport.dispatchEvent(new Event("resize"));
  flushFrames();
}

function workspaceField() {
  const workspace = document.createElement("div");
  workspace.className = "app-workspace";
  const field = document.createElement("textarea");
  workspace.append(field);
  document.body.append(workspace);
  return field;
}

function touch(target: Element, type: "touchstart" | "touchend", y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = [{ clientX: 10, clientY: y }];
  Object.assign(event, type === "touchstart" ? { touches: point } : { changedTouches: point });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  viewport = new FakeVisualViewport();
  frames = [];
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: LAYOUT_HEIGHT });
  Object.defineProperty(html, "clientHeight", { configurable: true, value: LAYOUT_HEIGHT });
  Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 0 });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  window.scrollTo = vi.fn((_x: number, y: number) => {
    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: y });
  }) as unknown as typeof window.scrollTo;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  localStorage.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("useMobileViewport", () => {
  it("measures the keyboard from the layout viewport while Safari shrinks innerHeight", () => {
    mount();
    expect(html.style.getPropertyValue("--mobile-keyboard-inset")).toBe("0px");
    workspaceField().focus();
    openKeyboard();
    expect(html.style.getPropertyValue("--mobile-viewport-height")).toBe("384px");
    expect(html.style.getPropertyValue("--mobile-keyboard-inset")).toBe(`${KEYBOARD_HEIGHT}px`);
  });

  it("tells the shell from a sheet as the owner of the focused field", () => {
    mount();
    const field = workspaceField();
    field.focus();
    openKeyboard();
    expect(html.getAttribute("data-mobile-keyboard")).toBe("shell");

    const sheetField = document.createElement("input");
    document.body.append(sheetField);
    sheetField.focus();
    flushFrames();
    expect(html.getAttribute("data-mobile-keyboard")).toBe("overlay");

    // A dialog portaled inside the workspace is still a surface over it.
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const dialogField = document.createElement("input");
    dialog.append(dialogField);
    field.parentElement!.append(dialog);
    dialogField.focus();
    flushFrames();
    expect(html.getAttribute("data-mobile-keyboard")).toBe("overlay");

    dialogField.blur();
    flushFrames();
    expect(html.hasAttribute("data-mobile-keyboard")).toBe(false);
  });

  it("scrolls the document back when Safari scrolls it to a field", () => {
    mount();
    window.scrollY = 69;
    window.dispatchEvent(new Event("scroll"));
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(window.scrollY).toBe(0);
  });

  it("leaves a pinch-zoomed page and a scrolling page alone", () => {
    mount();
    viewport.scale = 2;
    window.scrollY = 120;
    window.dispatchEvent(new Event("scroll"));
    expect(window.scrollTo).not.toHaveBeenCalled();

    act(() => root.render(createElement(Probe, { pinDocument: false })));
    viewport.scale = 1;
    window.dispatchEvent(new Event("scroll"));
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("focuses a tapped field itself, out of Safari's sight for one frame", () => {
    mount();
    const field = workspaceField();
    touch(field, "touchstart", 300);
    const end = touch(field, "touchend", 302);
    expect(end.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(field.style.transform).toBe("translateY(-2000px)");
    flushFrames();
    expect(field.style.transform).toBe("");
  });

  it("lets a scroll that started on a field end without focusing it", () => {
    mount();
    const field = workspaceField();
    touch(field, "touchstart", 300);
    const end = touch(field, "touchend", 200);
    expect(end.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(field);
  });

  it("lays out for the keyboard as soon as a field takes the focus, at its last height", () => {
    mount();
    const field = workspaceField();
    field.focus();
    openKeyboard();
    field.blur();
    flushFrames();
    // Keyboard on its way out: announced closed before Safari reports it.
    expect(html.style.getPropertyValue("--mobile-keyboard-inset")).toBe("0px");
    expect(html.hasAttribute("data-mobile-keyboard")).toBe(false);

    viewport.height = LAYOUT_HEIGHT;
    viewport.dispatchEvent(new Event("resize"));
    flushFrames();
    field.focus();
    // Before any resize: the height remembered from the last opening.
    expect(html.style.getPropertyValue("--mobile-keyboard-inset")).toBe(`${KEYBOARD_HEIGHT}px`);
    expect(html.getAttribute("data-mobile-keyboard")).toBe("shell");
  });

  it("animates only while the keyboard opens or closes", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      mount();
      workspaceField().focus();
      openKeyboard();
      expect(html.hasAttribute("data-mobile-keyboard-moving")).toBe(true);
      vi.advanceTimersByTime(500);
      expect(html.hasAttribute("data-mobile-keyboard-moving")).toBe(false);
      // A suggestion bar appearing: the keyboard changes size, not state.
      viewport.height -= 40;
      viewport.dispatchEvent(new Event("resize"));
      flushFrames();
      expect(html.hasAttribute("data-mobile-keyboard-moving")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks an open sheet, so the band under it outlives its field's focus", () => {
    mount();
    const sheet = document.createElement("div");
    sheet.setAttribute("data-slot", "sheet-content");
    document.body.append(sheet);
    workspaceField().focus();
    flushFrames();
    expect(html.hasAttribute("data-mobile-surface")).toBe(true);
    sheet.remove();
    (document.activeElement as HTMLElement).blur();
    flushFrames();
    expect(html.hasAttribute("data-mobile-surface")).toBe(false);
  });

  it("clears what it published on unmount", () => {
    mount();
    workspaceField().focus();
    openKeyboard();
    act(() => root.unmount());
    expect(html.style.getPropertyValue("--mobile-keyboard-inset")).toBe("");
    expect(html.hasAttribute("data-mobile-keyboard")).toBe(false);
    root = createRoot(container);
  });
});

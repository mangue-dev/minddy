// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHEET_STRETCH_LIMIT, attachSheetSwipeDismiss, canDragSheetFrom, canStretchSheetFrom, sheetStretch, shouldDismissSheet } from "./sheet-swipe-dismiss";

describe("shouldDismissSheet", () => {
  it("closes past a quarter of the sheet's height", () => {
    expect(shouldDismissSheet({ offset: 100, height: 400, velocity: 0 })).toBe(true);
    expect(shouldDismissSheet({ offset: 99, height: 400, velocity: 0 })).toBe(false);
  });

  it("closes on a flick, but not on a tremor or an upward move", () => {
    expect(shouldDismissSheet({ offset: 40, height: 400, velocity: 0.8 })).toBe(true);
    expect(shouldDismissSheet({ offset: 4, height: 400, velocity: 0.8 })).toBe(false);
    expect(shouldDismissSheet({ offset: 0, height: 400, velocity: 2 })).toBe(false);
  });
});

function scrollable(element: HTMLElement, scrollTop: number) {
  element.style.overflowY = "auto";
  Object.defineProperty(element, "scrollHeight", { configurable: true, value: 800 });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: 200 });
  element.scrollTop = scrollTop;
}

let overlay: HTMLDivElement;
let sheet: HTMLDivElement;
let row: HTMLButtonElement;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  overlay = document.createElement("div");
  overlay.dataset.slot = "sheet-overlay";
  sheet = document.createElement("div");
  sheet.dataset.state = "open";
  Object.defineProperty(sheet, "offsetHeight", { configurable: true, value: 400 });
  row = document.createElement("button");
  sheet.append(row);
  document.body.append(overlay, sheet);
});
afterEach(() => {
  overlay.remove();
  sheet.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sheetStretch", () => {
  it("follows the finger at first, then resists towards its limit", () => {
    expect(sheetStretch(0)).toBe(0);
    expect(sheetStretch(-20)).toBe(0);
    expect(sheetStretch(10)).toBeGreaterThan(4);
    expect(sheetStretch(100)).toBeLessThan(30);
    expect(sheetStretch(10_000)).toBeLessThan(SHEET_STRETCH_LIMIT);
  });
});

describe("canStretchSheetFrom", () => {
  it("stretches from content that does not scroll", () => {
    expect(canStretchSheetFrom(row, sheet)).toBe(true);
  });

  it("leaves the upward swipe to anything that scrolls, and editors their gestures", () => {
    const list = document.createElement("div");
    const item = document.createElement("div");
    list.append(item);
    sheet.append(list);
    scrollable(list, 0);
    expect(canStretchSheetFrom(item, sheet)).toBe(false);
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    sheet.append(editor);
    expect(canStretchSheetFrom(editor, sheet)).toBe(false);
  });
});

describe("canDragSheetFrom", () => {
  it("drags from a row while every scroller sits at its top", () => {
    scrollable(sheet, 0);
    expect(canDragSheetFrom(row, sheet)).toBe(true);
  });

  it("lets a list scrolled down scroll back first", () => {
    const list = document.createElement("div");
    const item = document.createElement("div");
    list.append(item);
    sheet.append(list);
    scrollable(list, 120);
    expect(canDragSheetFrom(item, sheet)).toBe(false);
  });

  it("leaves editors and sliders their own gestures", () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const slider = document.createElement("input");
    slider.type = "range";
    sheet.append(editor, slider);
    expect(canDragSheetFrom(editor, sheet)).toBe(false);
    expect(canDragSheetFrom(slider, sheet)).toBe(false);
  });

  it("ignores touches outside the sheet", () => {
    expect(canDragSheetFrom(overlay, sheet)).toBe(false);
  });
});

function touch(type: string, target: Element, y: number, timeStamp: number, x = 0) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const points = type === "touchend" ? [] : [{ clientX: x, clientY: y }];
  Object.defineProperties(event, {
    touches: { value: points },
    changedTouches: { value: [{ clientX: x, clientY: y }] },
    timeStamp: { value: timeStamp },
  });
  target.dispatchEvent(event);
  return event;
}

describe("attachSheetSwipeDismiss", () => {
  it("follows the finger and closes once released far enough", () => {
    const close = vi.fn();
    const detach = attachSheetSwipeDismiss(sheet, close);
    touch("touchstart", row, 100, 0);
    touch("touchmove", row, 110, 100);
    const move = touch("touchmove", row, 260, 500);
    expect(move.defaultPrevented).toBe(true);
    expect(sheet.style.transform).toBe("translate3d(0, 150px, 0)");
    expect(Number(overlay.style.opacity)).toBeCloseTo(0.625);
    touch("touchend", row, 260, 510);
    expect(close).toHaveBeenCalledTimes(1);
    detach();
  });

  it("springs back after a short, slow drag", () => {
    const close = vi.fn();
    const detach = attachSheetSwipeDismiss(sheet, close);
    touch("touchstart", row, 100, 0);
    touch("touchmove", row, 110, 200);
    touch("touchmove", row, 150, 1000);
    touch("touchend", row, 150, 1300);
    expect(close).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe("");
    expect(overlay.style.opacity).toBe("");
    detach();
  });

  it("returns to its place when a guard keeps the sheet open", () => {
    const close = vi.fn();
    const detach = attachSheetSwipeDismiss(sheet, close);
    touch("touchstart", row, 100, 0);
    touch("touchmove", row, 110, 100);
    touch("touchmove", row, 300, 500);
    touch("touchend", row, 300, 510);
    expect(close).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(150);
    expect(sheet.style.transform).toBe("");
    detach();
  });

  it("stretches when pulled up, with resistance, and springs back to its own size", () => {
    const detach = attachSheetSwipeDismiss(sheet, vi.fn());
    touch("touchstart", row, 300, 0);
    touch("touchmove", row, 290, 50);
    const pull = touch("touchmove", row, 190, 300);
    expect(pull.defaultPrevented).toBe(true);
    // Its foot stays put: it grows instead of moving.
    expect(sheet.style.transform).toBe("");
    expect(sheet.style.maxHeight).toBe("none");
    const grown = Number.parseFloat(sheet.style.height) - 400;
    expect(grown).toBeGreaterThan(0);
    expect(grown).toBeLessThan(100);
    touch("touchend", row, 190, 600);
    expect(sheet.style.height).toBe("400px");
    vi.advanceTimersByTime(500);
    expect(sheet.style.height).toBe("");
    expect(sheet.style.maxHeight).toBe("");
    detach();
  });

  it("leaves upward scrolls and sideways swipes to the content", () => {
    // A sheet whose content scrolls: the upward swipe is the list's.
    scrollable(sheet, 0);
    const close = vi.fn();
    const detach = attachSheetSwipeDismiss(sheet, close);
    touch("touchstart", row, 300, 0);
    const up = touch("touchmove", row, 200, 100);
    touch("touchmove", row, 500, 200);
    touch("touchend", row, 500, 210);
    touch("touchstart", row, 100, 300, 0);
    const sideways = touch("touchmove", row, 120, 400, 80);
    touch("touchend", row, 300, 410, 80);
    expect(up.defaultPrevented).toBe(false);
    expect(sideways.defaultPrevented).toBe(false);
    expect(sheet.style.transform).toBe("");
    expect(close).not.toHaveBeenCalled();
    detach();
  });

  it("stops listening once detached", () => {
    const close = vi.fn();
    attachSheetSwipeDismiss(sheet, close)();
    touch("touchstart", row, 100, 0);
    touch("touchmove", row, 400, 100);
    touch("touchend", row, 400, 110);
    expect(close).not.toHaveBeenCalled();
  });
});

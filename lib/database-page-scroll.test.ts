// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bindDatabasePageScroll } from "./database-page-scroll";

let viewport: HTMLElement;
let cleanup: () => void;
beforeEach(() => {
  document.body.innerHTML = '<aside>Sidebar</aside><header>Header</header><main><div id="table"></div><button>Action</button><div id="blank"></div></main>';
  viewport = document.getElementById("table")!;
  Object.defineProperties(viewport, {
    scrollWidth: { value: 1600, configurable: true },
    clientWidth: { value: 600, configurable: true },
  });
  cleanup = bindDatabasePageScroll(viewport);
});
afterEach(() => { cleanup(); document.body.innerHTML = ""; });

function wheel(target: Element, options: WheelEventInit) {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
}
function touch(type: string, points: Array<[number, number]>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: points.map(([clientX, clientY]) => ({ clientX, clientY })) });
  document.getElementById("blank")!.dispatchEvent(event);
  return event;
}

describe("page-wide database gestures", () => {
  it("routes gestures outside the table without doubling native scrolling", () => {
    for (const selector of ["aside", "header", "button", "#blank"]) {
      viewport.scrollLeft = 0;
      const event = wheel(document.querySelector(selector)!, { deltaX: 120 });
      expect(viewport.scrollLeft).toBe(120);
      expect(event.defaultPrevented).toBe(true);
    }
  });
  it("leaves table gestures to native scrolling while retaining Shift-wheel routing", () => {
    const child = document.createElement("button");
    viewport.append(child);
    expect(wheel(child, { deltaX: 120 }).defaultPrevented).toBe(false);
    expect(viewport.scrollLeft).toBe(0);
    expect(wheel(child, { deltaY: 120, shiftKey: true }).defaultPrevented).toBe(true);
    expect(viewport.scrollLeft).toBe(120);
  });
  it("handles Shift-wheel and line/page units, clamping both boundaries", () => {
    wheel(document.body, { deltaY: 3, deltaMode: 1, shiftKey: true });
    expect(viewport.scrollLeft).toBe(48);
    wheel(document.body, { deltaX: 1, deltaMode: 2 });
    expect(viewport.scrollLeft).toBe(648);
    wheel(document.body, { deltaX: 1000 });
    expect(viewport.scrollLeft).toBe(1000);
    wheel(document.body, { deltaX: -2000 });
    expect(viewport.scrollLeft).toBe(0);
  });
  it("preserves vertical scrolling, pinch zoom, and non-overflowing pages", () => {
    for (const options of [{ deltaY: 100 }, { deltaX: 10, deltaY: 100 }, { deltaX: 100, ctrlKey: true }]) {
      expect(wheel(document.body, options).defaultPrevented).toBe(false);
      expect(viewport.scrollLeft).toBe(0);
    }
    Object.defineProperty(viewport, "scrollWidth", { value: 600 });
    expect(wheel(document.body, { deltaX: 100 }).defaultPrevented).toBe(false);
  });
  it("routes horizontal touch drags from blank space and locks vertical drags to native scrolling", () => {
    touch("touchstart", [[250, 200]]);
    expect(touch("touchmove", [[247, 201]]).defaultPrevented).toBe(false);
    expect(touch("touchmove", [[150, 202]]).defaultPrevented).toBe(true);
    expect(viewport.scrollLeft).toBe(100);
    touch("touchmove", [[120, 204]]);
    expect(viewport.scrollLeft).toBe(130);
    touch("touchend", []);
    touch("touchstart", [[250, 200]]);
    expect(touch("touchmove", [[248, 100]]).defaultPrevented).toBe(false);
    expect(touch("touchmove", [[50, 100]]).defaultPrevented).toBe(false);
    expect(viewport.scrollLeft).toBe(130);
  });
  it("does not capture multi-touch zoom or reuse a cancelled gesture", () => {
    touch("touchstart", [[250, 200]]);
    expect(touch("touchmove", [[200, 200], [300, 200]]).defaultPrevented).toBe(false);
    expect(touch("touchmove", [[150, 200]]).defaultPrevented).toBe(false);
    touch("touchstart", [[250, 200]]);
    touch("touchcancel", []);
    expect(touch("touchmove", [[150, 200]]).defaultPrevented).toBe(false);
    expect(viewport.scrollLeft).toBe(0);
  });
  it("removes every listener when leaving the database page", () => {
    cleanup();
    expect(wheel(document.body, { deltaX: 100 }).defaultPrevented).toBe(false);
    touch("touchstart", [[250, 200]]);
    expect(touch("touchmove", [[150, 200]]).defaultPrevented).toBe(false);
    expect(viewport.scrollLeft).toBe(0);
  });
});

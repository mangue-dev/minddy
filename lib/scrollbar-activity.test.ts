// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SCROLLBAR_FADE_DURATION,
  SCROLLBAR_IDLE_DELAY,
  trackScrollbarActivity,
} from "./scrollbar-activity";

describe("trackScrollbarActivity", () => {
  let stop: () => void;
  let outer: HTMLElement;
  let inner: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="outer"><div id="inner"></div></div>';
    outer = document.getElementById("outer")!;
    inner = document.getElementById("inner")!;
    stop = trackScrollbarActivity(document);
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  const scroll = (el: Element) => el.dispatchEvent(new Event("scroll"));

  it("shows the bar of the scroller that moved, and only that one", () => {
    scroll(inner);
    expect(inner.getAttribute("data-scrollbar")).toBe("active");
    expect(outer.hasAttribute("data-scrollbar")).toBe(false);
  });

  it("keeps the bar while scrolling continues, then fades and clears it", () => {
    scroll(inner);
    vi.advanceTimersByTime(SCROLLBAR_IDLE_DELAY - 100);
    scroll(inner);
    vi.advanceTimersByTime(SCROLLBAR_IDLE_DELAY - 100);
    expect(inner.getAttribute("data-scrollbar")).toBe("active");

    vi.advanceTimersByTime(100);
    expect(inner.getAttribute("data-scrollbar")).toBe("fading");
    vi.advanceTimersByTime(SCROLLBAR_FADE_DURATION);
    expect(inner.hasAttribute("data-scrollbar")).toBe(false);
  });

  it("shows the bar again when scrolling resumes during the fade", () => {
    scroll(inner);
    vi.advanceTimersByTime(SCROLLBAR_IDLE_DELAY);
    expect(inner.getAttribute("data-scrollbar")).toBe("fading");
    scroll(inner);
    vi.advanceTimersByTime(SCROLLBAR_FADE_DURATION);
    expect(inner.getAttribute("data-scrollbar")).toBe("active");
  });

  it("marks the root element for a document scroll", () => {
    document.dispatchEvent(new Event("scroll"));
    expect(document.documentElement.getAttribute("data-scrollbar")).toBe("active");
  });

  it("clears every mark when it stops", () => {
    scroll(inner);
    stop();
    expect(inner.hasAttribute("data-scrollbar")).toBe(false);
    vi.advanceTimersByTime(SCROLLBAR_IDLE_DELAY * 2);
    expect(inner.hasAttribute("data-scrollbar")).toBe(false);
  });
});

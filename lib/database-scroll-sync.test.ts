// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bindDatabaseScrollSync } from "./database-scroll-sync";

let viewport: HTMLElement;
let scrollbar: HTMLElement;
let cleanup: () => void;
const notify = (element: HTMLElement) =>
  element.dispatchEvent(new Event("scroll"));

beforeEach(() => {
  viewport = document.createElement("div");
  scrollbar = document.createElement("div");
  cleanup = bindDatabaseScrollSync(viewport, scrollbar);
});
afterEach(() => cleanup());

describe("database scrollbar synchronization", () => {
  it("does not rewind a native gesture when the scrollbar's mirrored event arrives late", () => {
    viewport.scrollLeft = 10;
    notify(viewport);
    viewport.scrollLeft = 20;
    notify(scrollbar);
    expect(viewport.scrollLeft).toBe(20);
    notify(viewport);
    expect(scrollbar.scrollLeft).toBe(20);
    expect(scrollbar.getAttribute("aria-valuenow")).toBe("20");
  });

  it("does not rewind scrollbar dragging when the viewport's mirrored event arrives late", () => {
    scrollbar.scrollLeft = 10;
    notify(scrollbar);
    scrollbar.scrollLeft = 20;
    notify(viewport);
    expect(scrollbar.scrollLeft).toBe(20);
    notify(scrollbar);
    expect(viewport.scrollLeft).toBe(20);
  });

  it("accepts direction changes and returning to a previously mirrored position", () => {
    for (const position of [100, 200, 100, 0]) {
      scrollbar.scrollLeft = position;
      notify(scrollbar);
      notify(viewport);
      expect(viewport.scrollLeft).toBe(position);
    }
    for (const position of [100, 200, 100, 0]) {
      viewport.scrollLeft = position;
      notify(viewport);
      notify(scrollbar);
      expect(scrollbar.scrollLeft).toBe(position);
    }
  });

  it("tracks the applied mirror position when the browser rounds fractional offsets", () => {
    let offset = 0;
    Object.defineProperty(scrollbar, "scrollLeft", {
      get: () => offset,
      set: (value: number) => {
        offset = Math.round(value);
      },
    });
    viewport.scrollLeft = 10.25;
    notify(viewport);
    viewport.scrollLeft = 20.5;
    notify(scrollbar);
    expect(viewport.scrollLeft).toBe(20.5);
    notify(viewport);
    expect(scrollbar.scrollLeft).toBe(21);
    notify(scrollbar);
    expect(viewport.scrollLeft).toBe(20.5);
  });

  it("initializes from the table and removes both listeners on cleanup", () => {
    cleanup();
    viewport.scrollLeft = 100;
    cleanup = bindDatabaseScrollSync(viewport, scrollbar);
    expect(scrollbar.scrollLeft).toBe(100);
    cleanup();
    viewport.scrollLeft = 200;
    notify(viewport);
    expect(scrollbar.scrollLeft).toBe(100);
    scrollbar.scrollLeft = 300;
    notify(scrollbar);
    expect(viewport.scrollLeft).toBe(200);
  });
});

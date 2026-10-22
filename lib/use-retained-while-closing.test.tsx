// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OVERLAY_EXIT_MS, useRetainedWhileClosing } from "./use-retained-while-closing";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const seen: (string | null)[] = [];
function Probe({ value }: { value: string | null }) {
  seen.push(useRetainedWhileClosing(value));
  return null;
}

let root: Root;
const render = (value: string | null) => act(() => root.render(createElement(Probe, { value })));
const latest = () => seen[seen.length - 1];

beforeEach(() => {
  vi.useFakeTimers();
  seen.length = 0;
  root = createRoot(document.createElement("div"));
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe("useRetainedWhileClosing", () => {
  it("keeps the last value through the exit animation, then releases it", () => {
    render("MIN-1");
    render(null);
    expect(latest()).toBe("MIN-1");

    act(() => vi.advanceTimersByTime(OVERLAY_EXIT_MS - 1));
    expect(latest()).toBe("MIN-1");
    act(() => vi.advanceTimersByTime(1));
    expect(latest()).toBeNull();
  });

  it("shows a value reopened during the exit at once and keeps it", () => {
    render("MIN-1");
    render(null);
    render("MIN-2");
    expect(seen).not.toContain(null);
    expect(latest()).toBe("MIN-2");

    act(() => vi.advanceTimersByTime(OVERLAY_EXIT_MS * 2));
    expect(latest()).toBe("MIN-2");
  });

  it("never retains anything when nothing was shown", () => {
    render(null);
    expect(latest()).toBeNull();
  });
});

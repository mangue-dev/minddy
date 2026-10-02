// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OneLine } from "@/components/one-line";

let resized: (() => void) | undefined;
const disconnected = vi.fn();
vi.stubGlobal("ResizeObserver", class {
  constructor(callback: () => void) { resized = callback; }
  observe() {}
  disconnect() { disconnected(); }
});
vi.stubGlobal("requestAnimationFrame", () => 1);
vi.stubGlobal("cancelAnimationFrame", vi.fn());
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

vi.mock("@/components/ui/tooltip", async () => {
  const { createElement, Fragment } = await import("react");
  return {
    Tooltip: ({ children, open }: any) => createElement("div", { "data-disabled": open === false }, children),
    TooltipTrigger: ({ children }: any) => createElement(Fragment, null, children),
    TooltipContent: ({ children }: any) => createElement("span", null, children),
  };
});

afterEach(() => { document.body.innerHTML = ""; vi.clearAllMocks(); });

describe("activity text overflow", () => {
  it("updates tooltip eligibility on resize without replacing the focused text or remeasuring unrelated renders", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(createElement(OneLine, { full: "Activity details", children: "Details" })); });
    const text = container.querySelector("p")!;
    text.tabIndex = 0;
    text.focus();
    let width = 50;
    const reads = vi.fn(() => 100);
    Object.defineProperty(text, "scrollWidth", { get: reads });
    Object.defineProperty(text, "clientWidth", { get: () => width });
    await act(async () => { resized?.(); });
    expect(container.querySelector("[data-disabled]")?.getAttribute("data-disabled")).toBe("false");
    expect(container.querySelector("p")).toBe(text);
    expect(document.activeElement).toBe(text);
    const measured = reads.mock.calls.length;
    await act(async () => { root.render(createElement(OneLine, { full: "Activity details", children: "Details" })); });
    expect(reads).toHaveBeenCalledTimes(measured);
    width = 200;
    await act(async () => { resized?.(); });
    expect(container.querySelector("[data-disabled]")?.getAttribute("data-disabled")).toBe("true");
    expect(container.querySelector("p")).toBe(text);
    await act(async () => root.unmount());
    expect(disconnected).toHaveBeenCalled();
  });
});

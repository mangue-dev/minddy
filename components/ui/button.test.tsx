// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppTooltip } from "./app-tooltip";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { TooltipProvider } from "./tooltip";
import { TruncatedText } from "./truncated-text";

// Key caps hide in the mobile layout; these tests describe the desktop one.
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => false }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  // Radix measures the tooltip's anchor once it opens.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function render(node: ReactNode, provided = true) {
  await act(() => root.render(provided ? createElement(TooltipProvider, null, node) : node));
}

/** A Tab then focus, as keyboard navigation does: it opens a tooltip right away. */
async function focus(element: Element) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
  await act(async () => (element as HTMLElement).focus());
}

/** Focus placed by code after Enter, as a dialog does when it opens. */
async function focusAfterEnter(element: Element) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  await act(async () => (element as HTMLElement).focus());
}

const tooltips = () => [...document.querySelectorAll('[role="tooltip"]')].map((node) => node.textContent);

describe("icon-only buttons", () => {
  it("show their accessible name as a tooltip", async () => {
    await render(createElement(Button, { size: "icon", "aria-label": "Copy link" }, "⧉"));
    await focus(container.querySelector("button")!);
    expect(tooltips()).toEqual(["Copy link"]);
  });

  it("do the same through IconButton", async () => {
    await render(createElement(IconButton, { "aria-label": "Close panel" }, "×"));
    await focus(container.querySelector("button")!);
    expect(tooltips()).toEqual(["Close panel"]);
  });

  it("include the keys of the equivalent shortcut", async () => {
    await render(createElement(Button, { size: "icon-sm", "aria-label": "Search", shortcut: ["⌘", "K"] }, "⌕"));
    await focus(container.querySelector("button")!);
    const keys = [...document.querySelectorAll('[role="tooltip"] kbd')].map((key) => key.textContent);
    expect(keys).toEqual(["⌘", "K"]);
  });

  it("leave the tooltip to a caller that already provides one", async () => {
    await render(
      createElement(AppTooltip, {
        label: "Ask Numo",
        children: createElement(Button, { size: "icon", "aria-label": "Numo" }, "N"),
      }),
    );
    await focus(container.querySelector("button")!);
    expect(tooltips()).toEqual(["Ask Numo"]);
  });

  it("can opt out when visible text already names the action", async () => {
    await render(createElement(Button, { size: "icon", "aria-label": "Close", tooltip: false }, "×"));
    await focus(container.querySelector("button")!);
    expect(tooltips()).toEqual([]);
  });

  it("render without a tooltip provider, as isolated renders do", async () => {
    await render(createElement(Button, { size: "icon", "aria-label": "Close" }, "×"), false);
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Close");
    expect(tooltips()).toEqual([]);
  });

  it("stay closed on the focus a dialog places on its close button", async () => {
    await render(createElement(Button, { size: "icon-sm", "aria-label": "Close" }, "×"));
    await focusAfterEnter(container.querySelector("button")!);
    expect(tooltips()).toEqual([]);
  });

  it("leave buttons with visible text alone", async () => {
    await render(createElement(Button, { "aria-label": "Save the issue" }, "Save"));
    await focus(container.querySelector("button")!);
    expect(tooltips()).toEqual([]);
  });
});

describe("truncated text", () => {
  function setWidths(element: HTMLElement, scrollWidth: number, clientWidth: number) {
    Object.defineProperty(element, "scrollWidth", { configurable: true, value: scrollWidth });
    Object.defineProperty(element, "clientWidth", { configurable: true, value: clientWidth });
  }

  it("shows the full text when CSS cuts it", async () => {
    await render(createElement(TruncatedText, { text: "A very long issue title that does not fit" }));
    const span = container.querySelector("span")!;
    span.tabIndex = 0;
    setWidths(span, 400, 120);
    await focus(span);
    expect(tooltips()).toEqual(["A very long issue title that does not fit"]);
  });

  it("stays quiet when the text fits", async () => {
    await render(createElement(TruncatedText, { text: "Short" }));
    const span = container.querySelector("span")!;
    span.tabIndex = 0;
    setWidths(span, 80, 120);
    await focus(span);
    expect(tooltips()).toEqual([]);
  });
});

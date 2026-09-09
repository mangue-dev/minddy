// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarVisibilityButton } from "@/components/sidebar-visibility-button";
import { SidebarNavOverlay } from "@/components/sidebar-nav-overlay";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarVisibilityProvider, useSidebarVisibility } from "./sidebar-visibility-context";
import en from "@/messages/en.json";

const viewport = vi.hoisted(() => ({ compact: false }));
vi.mock("mangue-ui", () => ({
  cn: (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(" "),
  useMediaQuery: () => viewport.compact,
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: () => null,
}));
vi.mock("@/lib/use-window-buttons", () => ({
  useHoldWindowButtons: vi.fn(),
  useWideLayout: () => true,
}));

function Navigation({ collapsed = false }: { collapsed?: boolean }) {
  const { hidden } = useSidebarVisibility();
  const button = createElement(SidebarVisibilityButton, { collapsed });
  return createElement(SidebarNavOverlay, {
    width: 256, dockedWidth: collapsed ? 56 : 256, hidden, children: button,
  });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  });
  viewport.compact = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(collapsed = false) {
  const children: ReactNode = createElement(TooltipProvider, null,
    createElement(SidebarVisibilityProvider, {
      children: createElement(Navigation, { collapsed }),
    }),
  );
  act(() => root.render(createElement(NextIntlClientProvider, {
    locale: "en", messages: { Nav: en.Nav }, children,
  })));
}

function button() {
  return container.querySelector<HTMLButtonElement>("button")!;
}

function isHidden() {
  return container.querySelector("[data-sidebar-hidden]")?.getAttribute("data-sidebar-hidden") === "true";
}

function panel() {
  return container.querySelector<HTMLElement>("[data-open]");
}

describe("sidebar visibility", () => {
  it("hides navigation, recalls it from the edge, and restores it with one click", () => {
    render();
    expect(button().textContent).toBe("Hide sidebar");
    expect(isHidden()).toBe(false);
    act(() => button().click());
    expect(button().getAttribute("aria-label")).toBe("Show sidebar");
    expect(panel()?.dataset.open).toBe("false");
    act(() => container.querySelector(".sidebar-nav-hotzone")!.dispatchEvent(
      new MouseEvent("pointerover", { bubbles: true }),
    ));
    expect(panel()?.dataset.open).toBe("true");
    act(() => button().click());
    expect(isHidden()).toBe(false);
    expect(button().getAttribute("aria-label")).toBe("Hide sidebar");
  });

  it("forces the sidebar hidden and disables the toggle below 1200 px", () => {
    viewport.compact = true;
    render();
    expect(panel()?.dataset.open).toBe("false");
    expect(isHidden()).toBe(true);
    expect(button().disabled).toBe(true);
    expect(button().className).toContain("cursor-not-allowed");
    act(() => button().click());
    expect(isHidden()).toBe(true);
    viewport.compact = false;
    render();
    expect(isHidden()).toBe(false);
    expect(button().disabled).toBe(false);
  });

  it("keeps the breakpoint authoritative after a wider-screen show choice", () => {
    render();
    act(() => button().click());
    act(() => button().click());
    expect(isHidden()).toBe(false);

    viewport.compact = true;
    render();
    expect(isHidden()).toBe(true);
    expect(button().disabled).toBe(true);

    viewport.compact = false;
    render();
    expect(isHidden()).toBe(false);
  });

  it("follows viewport defaults until a visibility preference is chosen", () => {
    render();
    expect(isHidden()).toBe(false);
    viewport.compact = true;
    render();
    expect(isHidden()).toBe(true);
    viewport.compact = false;
    render();
    expect(isHidden()).toBe(false);
  });

  it("recalls hidden navigation for keyboard focus and releases it on focus exit", () => {
    render();
    const control = button();
    act(() => control.click());
    act(() => control.blur());
    const matches = control.matches.bind(control);
    vi.spyOn(control, "matches").mockImplementation(selector =>
      selector === ":focus-visible" || matches(selector),
    );
    act(() => control.focus());
    expect(panel()?.dataset.open).toBe("true");
    act(() => control.blur());
    expect(panel()?.dataset.open).toBe("false");
  });

  it("preserves navigation DOM and focus across hide/show instead of remounting", () => {
    render();
    const navigationPanel = panel();
    const control = button();
    act(() => control.focus());
    act(() => control.click());
    expect(panel()).toBe(navigationPanel);
    expect(button()).toBe(control);
    expect(document.activeElement).toBe(control);
    act(() => control.click());
    expect(panel()).toBe(navigationPanel);
    expect(button()).toBe(control);
    expect(document.activeElement).toBe(control);
  });

  it("keeps the rail control named and usable without its visible label", () => {
    render(true);
    expect(button().getAttribute("aria-label")).toBe("Hide sidebar");
    expect(button().textContent).toBe("");
    act(() => button().click());
    expect(button().getAttribute("aria-label")).toBe("Show sidebar");
  });
});

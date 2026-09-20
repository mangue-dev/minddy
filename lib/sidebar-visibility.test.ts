// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarVisibilityButton } from "@/components/sidebar-visibility-button";
import { SidebarNavOverlay } from "@/components/sidebar-nav-overlay";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarVisibilityProvider, useSidebarVisibility } from "./sidebar-visibility-context";
import en from "@/messages/en.json";

const viewport = vi.hoisted(() => ({ compact: false, reducedMotion: false }));
vi.mock("framer-motion", async (importOriginal) => ({
  ...await importOriginal<typeof import("framer-motion")>(),
  useReducedMotion: () => viewport.reducedMotion,
}));
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
  // The choice persists in localStorage now; tests start from the docked state.
  window.localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  });
  viewport.compact = false;
  viewport.reducedMotion = false;
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
  it("persists the toggle in localStorage across remounts", () => {
    render();
    expect(isHidden()).toBe(false);
    act(() => button().click());
    expect(isHidden()).toBe(true);
    expect(window.localStorage.getItem("minddy.sidebar-hidden")).toBe("true");
    act(() => button().click());
    expect(window.localStorage.getItem("minddy.sidebar-hidden")).toBe("false");
    expect(isHidden()).toBe(false);
  });

  it("applies the stored choice at first render and follows other tabs", () => {
    window.localStorage.setItem("minddy.sidebar-hidden", "true");
    render();
    expect(isHidden()).toBe(true);
    // Another tab's write lands in this tab's storage, then its `storage`
    // event replays the change here.
    window.localStorage.setItem("minddy.sidebar-hidden", "false");
    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: "minddy.sidebar-hidden",
    })));
    expect(isHidden()).toBe(false);
  });

  it("hydrates the stored choice without a server/client mismatch", async () => {
    window.localStorage.setItem("minddy.sidebar-hidden", "true");
    const children: ReactNode = createElement(NextIntlClientProvider, {
      locale: "en", messages: { Nav: en.Nav },
      children: createElement(TooltipProvider, null,
        createElement(SidebarVisibilityProvider, {
          children: createElement(Navigation),
        })),
    });
    container.innerHTML = renderToStaticMarkup(children);
    const problems: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      problems.push(args.map(String).join(" "));
    });
    let hydratedRoot: Root | null = null;
    await act(async () => { hydratedRoot = hydrateRoot(container, children); });
    spy.mockRestore();
    expect(problems.join("\n")).not.toMatch(/hydrat/i);
    expect(isHidden()).toBe(true);
    await act(async () => { hydratedRoot!.unmount(); });
  });

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

  it("commits content space once while preserving the mounted sliding surface", () => {
    render();
    const reserve = container.querySelector<HTMLElement>("[data-sidebar-hidden]")!;
    const navigationPanel = panel();
    expect(reserve.style.width).toBe("256px");
    act(() => button().click());
    expect(reserve.style.width).toBe("0px");
    expect(panel()).toBe(navigationPanel);
    expect(panel()?.style.width).toBe("256px");
    act(() => button().click());
    expect(reserve.style.width).toBe("256px");
  });

  it("finishes hide and show without a slide when reduced motion is enabled", async () => {
    viewport.reducedMotion = true;
    render();
    act(() => button().click());
    await vi.waitFor(() => expect(panel()?.style.transform).toContain("-256px"));
    act(() => button().click());
    await vi.waitFor(() => expect(panel()?.style.transform).toBe("none"));
  });

  it("keeps the rail control named and usable without its visible label", () => {
    render(true);
    expect(button().getAttribute("aria-label")).toBe("Hide sidebar");
    expect(button().textContent).toBe("");
    act(() => button().click());
    expect(button().getAttribute("aria-label")).toBe("Show sidebar");
  });
});

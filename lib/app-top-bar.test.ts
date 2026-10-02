// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AppTopBar } from "@/components/app-top-bar";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.mock("@/lib/use-window-buttons", () => ({ useWideLayout: () => true, useWindowButtonsSlot: () => ({ reserved: false }) }));
vi.mock("@/components/sidebar-visibility-button", () => ({ SidebarVisibilityButton: () => null }));
vi.mock("@/components/app-top-actions", () => ({ AppTopActions: () => null }));
vi.mock("@/components/app-tab-strip", () => ({ AppTabStrip: () => null }));
vi.mock("@/components/app-update-action", () => ({ AppUpdateAction: () => null }));
vi.mock("@/components/desktop-window-buttons", () => ({ WINDOW_BUTTONS_WIDTH: 80 }));

it("tracks bar presence through StrictMode and restores the previous document marker", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const documentRoot = document.documentElement;
  const render = () => createElement(StrictMode, null, createElement(AppTopBar, {
    hidden: false, inbox: {} as never, onSearch() {}, onSearchWarm() {}, onNewTab() {},
  }));
  try {
    expect(documentRoot.hasAttribute("data-app-top-bar")).toBe(false);
    await act(async () => root.render(render()));
    expect(container.querySelector(".app-top-bar")).not.toBeNull();
    expect(documentRoot.hasAttribute("data-app-top-bar")).toBe(true);
    await act(async () => root.render(null));
    expect(documentRoot.hasAttribute("data-app-top-bar")).toBe(false);
    documentRoot.setAttribute("data-app-top-bar", "existing-owner");
    await act(async () => root.render(render()));
    await act(async () => root.render(null));
    expect(documentRoot.getAttribute("data-app-top-bar")).toBe("existing-owner");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    documentRoot.removeAttribute("data-app-top-bar");
  }
});

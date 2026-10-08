// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
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
    ready: true, hidden: false, inbox: {} as never, onSearch() {}, onSearchWarm() {}, onNewTab() {},
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

it("reserves the server-rendered bar through hydration and delayed tab readiness", async () => {
  const render = (ready: boolean) => createElement(StrictMode, null, createElement(AppTopBar, {
    ready, hidden: false, inbox: {} as never, onSearch() {}, onSearchWarm() {}, onNewTab() {},
  }));
  const container = document.createElement("div");
  container.innerHTML = renderToString(render(false));
  document.body.append(container);
  const bar = container.querySelector(".app-top-bar");
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    expect(bar).not.toBeNull();
    expect(bar?.classList.contains("h-11")).toBe(true);
    expect(bar?.classList.contains("shrink-0")).toBe(true);
    expect(bar?.classList.contains("hidden")).toBe(true);
    expect(bar?.classList.contains("app-desktop:flex")).toBe(true);
    expect(bar?.childElementCount).toBe(0);
    expect(document.documentElement.hasAttribute("data-app-top-bar")).toBe(false);
    await act(async () => {
      root = hydrateRoot(container, render(false), { onRecoverableError: (error) => errors.push(error) });
    });
    expect(container.querySelector(".app-top-bar")).toBe(bar);
    expect(bar?.childElementCount).toBe(0);
    await act(async () => root!.render(render(true)));
    expect(container.querySelector(".app-top-bar")).toBe(bar);
    expect(bar?.querySelector(".app-titlebar-safe-area")).not.toBeNull();
    expect(document.documentElement.hasAttribute("data-app-top-bar")).toBe(true);
    await act(async () => root!.render(render(false)));
    expect(container.querySelector(".app-top-bar")).toBe(bar);
    expect(bar?.childElementCount).toBe(0);
    expect(document.documentElement.hasAttribute("data-app-top-bar")).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await act(async () => root?.unmount());
    container.remove();
    document.documentElement.removeAttribute("data-app-top-bar");
  }
});

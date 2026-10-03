// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AppTabRouteSync } from "@/components/app-tab-route-sync";
import { AppTabsSession } from "./app-tabs-session";
import { createHomeTab } from "./app-tabs";

const state = vi.hoisted(() => ({ path: "/projects/p/pages", navigation: null as unknown }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path, useSearchParams: () => new URLSearchParams() }));
vi.mock("./app-tab-navigation-context", () => ({ useOptionalAppTabNavigation: () => state.navigation }));
vi.mock("./current-view-context", () => ({ useCurrentViewTaggedPublication: () => null }));

it("acknowledges a committed target before an immediate in-view redirect", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const board = { ...createHomeTab("owner"), href: "/all" };
  const pages = { ...createHomeTab("owner", undefined, 1), href: "/projects/p/pages" };
  const session = new AppTabsSession("owner", { create: vi.fn(), close: vi.fn(), move: vi.fn(), patch: async (tab, patch) => ({ ...tab, ...patch }) });
  session.receive([board, pages]); await session.initialize("/all"); await session.activate(pages.id);
  state.path = pages.href; state.navigation = { session, activeId: pages.id };
  const element = document.createElement("div"), root = createRoot(element);
  const render = () => root.render(createElement("div", null, createElement(AppTabRouteSync), createElement(Redirect)));
  function Redirect() {
    useEffect(() => { state.path = "/projects/p/pages/document"; render(); }, []);
    return null;
  }
  try {
    await act(() => render());
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(session.getActiveHref()).toBe("/projects/p/pages/document");
    expect(session.getSnapshot().activeId).toBe(pages.id);
    expect(session.getSnapshot().error).toBeNull();
  } finally { await act(() => root.unmount()); session.dispose(); vi.unstubAllGlobals(); }
});

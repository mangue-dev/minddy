// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createPortal } from "react-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppTabViewHost } from "@/components/app-tab-view-host";
import { retainAppView } from "./retained-app-views";
import { useAppTabRoute } from "./app-tab-route-context";

const state = vi.hoisted(() => ({
  path: "/all", search: "", activeId: "board", activeHref: "/all",
  tabs: [{ id: "board" }, { id: "pages" }, { id: "other" }, { id: "fourth" }],
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.path,
  useSearchParams: () => new URLSearchParams(state.search),
  useParams: () => ({ id: state.path.split("/")[2] }),
}));
vi.mock("./app-tabs-context", () => ({
  useAppTabs: () => ({ tabs: state.tabs, activeId: state.activeId, session: state }),
  AppTabNavigationScope: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/board-loading-skeleton", () => ({ BoardLoadingSkeleton: () => null }));
vi.mock("next/dynamic", () => ({ default: () => Board }));

let liveEffects = 0;
let mounts = 0;
let keyboardEvents = 0;
function Board() {
  const route = useAppTabRoute();
  const [draft] = useState(() => `draft-${++mounts}`);
  useEffect(() => {
    liveEffects++;
    const onKey = () => { keyboardEvents++; };
    window.addEventListener("keydown", onKey);
    return () => { liveEffects--; window.removeEventListener("keydown", onKey); };
  }, []);
  return createElement("section", { "data-board-path": route.pathname, "data-board-search": route.searchParams.toString() },
    createElement("input", { defaultValue: draft }),
    createPortal(createElement("span", { "data-board-portal": route.pathname }, draft), document.body),
  );
}
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const render = async () => { await act(() => root.render(createElement(QueryClientProvider, { client }, createElement(AppTabViewHost, { children: createElement("p", null, "Other screen") })))); };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.assign(state, {
    path: "/all", search: "", activeId: "board", activeHref: "/all",
    tabs: [{ id: "board" }, { id: "pages" }, { id: "other" }, { id: "fourth" }],
    getActiveHref: () => state.activeHref,
    getSnapshot: () => ({ activeId: state.activeId }),
  });
  liveEffects = mounts = keyboardEvents = 0;
  client = new QueryClient();
  client.setQueryData(["me", "board"], { issues: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
});

describe("bounded retained board views", () => {
  it("preserves the exact DOM and input draft, suspends hidden effects and hides portals", async () => {
    await render();
    const input = container.querySelector("input")!;
    input.value = "Unsaved input";
    const board = container.querySelector<HTMLElement>("[data-retained-app-view]")!;
    board.scrollTop = 42;
    expect(liveEffects).toBe(1);
    state.path = "/projects/p/pages";
    state.activeHref = state.path;
    state.activeId = "pages";
    await render();
    expect(liveEffects).toBe(0);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "@" }));
    expect(keyboardEvents).toBe(0);
    expect(board.style.display).toBe("none");
    expect(document.querySelector<HTMLElement>("[data-board-portal]")!.style.display).toBe("none");
    expect(container.querySelector("input")).toBe(input);
    state.activeId = "board";
    state.path = "/all";
    state.activeHref = state.path;
    await render();
    expect(liveEffects).toBe(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "@" }));
    expect(keyboardEvents).toBe(1);
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("Unsaved input");
    expect(board.scrollTop).toBe(42);
    expect(mounts).toBe(1);
  });

  it("does not lend an outgoing board to an incoming tab before its route commits", async () => {
    await render();
    state.activeId = "other";
    state.activeHref = "/projects/another";
    await render();
    expect(container.querySelectorAll("input")).toHaveLength(1);
    state.path = "/projects/another";
    await render();
    expect(container.querySelectorAll("input")).toHaveLength(2);
    expect(liveEffects).toBe(1);
  });

  it("evicts the least recent board at the fixed bound and releases closed tabs", async () => {
    await render();
    for (const [id, path] of [["other", "/projects/p2"], ["fourth", "/projects/p3"], ["pages", "/projects/p4"]]) {
      Object.assign(state, { activeId: id, path, activeHref: path });
      await render();
    }
    expect(container.querySelectorAll("[data-retained-app-view]")).toHaveLength(2);
    expect(container.querySelector('[data-board-path="/all"]')).toBeNull();
    expect(liveEffects).toBe(1);
    state.tabs = [{ id: "pages" }];
    await render();
    expect(container.querySelectorAll("[data-retained-app-view]")).toHaveLength(1);
  });

  it("keeps independent same-route selections through an incoming query transition", async () => {
    state.search = "view=first";
    state.activeHref = "/all?view=first";
    await render();
    const input = container.querySelector("input")!;
    state.activeId = "other";
    state.activeHref = "/all?view=second";
    await render();
    expect(container.querySelectorAll("input")).toHaveLength(1);
    expect(container.querySelector("input")).toBe(input);
    state.search = "view=second";
    await render();
    expect(container.querySelectorAll("input")).toHaveLength(2);
    expect([...container.querySelectorAll("[data-board-search]")].map((element) => element.getAttribute("data-board-search"))).toEqual(["view=first", "view=second"]);
    expect(liveEffects).toBe(1);
  });

  it("keeps the outgoing DOM until an active close commits its replacement route", async () => {
    await render();
    const input = container.querySelector("input");
    state.tabs = state.tabs.filter((tab) => tab.id !== "board");
    state.activeId = "pages";
    state.activeHref = "/projects/p/pages";
    await render();
    expect(container.querySelector("input")).toBe(input);
    expect(mounts).toBe(1);
    state.path = state.activeHref;
    await render();
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(liveEffects).toBe(0);
  });

  it("adopts the startup board after account-tab restoration without another key", () => {
    const route = { pathname: "/all", search: "", projectId: null };
    const startup = retainAppView([], route, null, new Set());
    const restored = retainAppView(startup, route, "board", new Set(["board"]));
    expect(restored).toHaveLength(1);
    expect(restored[0].key).toBe(startup[0].key);
    expect(restored[0].tabId).toBe("board");
  });
});

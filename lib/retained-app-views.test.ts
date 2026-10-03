// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createPortal } from "react-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppTabViewHost } from "@/components/app-tab-view-host";
import { isRetainedDestination, retainAppView } from "./retained-app-views";
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
vi.mock("./runtime-config-provider", () => ({ useRuntimeConfig: () => ({ siteName: "minddy" }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
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
  client.setQueryData(["views", "global"], []);
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
  it("retains mixed late destinations with scoped routes and evicts a closed editor", async () => {
    state.tabs = Array.from({ length: 12 }, (_, index) => ({ id: `t${index}` }));
    const routes = ["/pull-requests", "/projects/p/pages/document", "/projects/p/feedback", "/projects/p/triage"];
    let editor: HTMLInputElement | null = null;
    for (const index of [8, 9, 10, 11, 8, 11, 10, 9]) {
      Object.assign(state, { activeId: `t${index}`, path: routes[index - 8], activeHref: routes[index - 8] });
      await render();
      const active = container.querySelector('[data-app-view-active="true"]')!;
      expect(active.querySelector("[data-board-path]")?.getAttribute("data-board-path")).toBe(routes[index - 8]);
      if (index === 9) {
        const current = active.querySelector("input")!;
        if (editor) expect(current).toBe(editor);
        editor = current; editor.value = "Retained editor draft";
      }
      expect(liveEffects).toBe(1);
      expect(container.querySelectorAll("[data-retained-app-view]").length).toBeLessThanOrEqual(6);
    }
    expect(editor!.value).toBe("Retained editor draft");
    state.tabs = state.tabs.filter((tab) => tab.id !== "t9");
    Object.assign(state, { activeId: "t11", path: routes[3], activeHref: routes[3] });
    await render();
    expect(editor!.isConnected).toBe(false);
  });

  it("reuses the Pages shell within a tab while keeping other projects isolated", () => {
    const open = new Set(["pages"]);
    const first = retainAppView([], { pathname: "/projects/p/pages/a", search: "", projectId: "p" }, "pages", open);
    const next = retainAppView(first, { pathname: "/projects/p/pages/b", search: "", projectId: "p" }, "pages", open);
    expect(next).toHaveLength(1); expect(next[0].key).toBe(first[0].key);
    expect(next[0].route.pathname).toBe("/projects/p/pages/b");
    const other = retainAppView(next, { pathname: "/projects/q/pages/a", search: "", projectId: "q" }, "pages", open);
    expect(other).toHaveLength(2); expect(other[0].route.projectId).toBe("p");
  });

  it("updates document metadata on retained returns and reads project names from the owner cache", async () => {
    client.setQueryData(["projects"], [{ id: "p", name: "Project P" }]);
    await render();
    expect(document.title).toContain("all");
    state.path = "/projects/p"; state.activeHref = state.path; state.activeId = "other";
    await render();
    expect(document.title).toContain("Project P");
    state.path = "/all"; state.activeHref = state.path; state.activeId = "board";
    await render();
    expect(document.title).toContain("all");
    state.path = "/projects/p"; state.activeHref = state.path; state.activeId = "other";
    await render();
    expect(document.title).toContain("Project P");
    const oldTitle = document.title;
    document.title = "Issue panel title";
    await act(() => { client.setQueryData(["projects"], [{ id: "p", name: "Renamed P" }]); });
    expect(document.title).toBe("Issue panel title");
    await act(async () => { document.title = oldTitle; await Promise.resolve(); });
    expect(document.title).toContain("Renamed P");
  });

  it("preserves the exact DOM and input draft, suspends hidden effects and hides portals", async () => {
    await render();
    const input = container.querySelector("input")!;
    input.value = "Unsaved input";
    const board = container.querySelector<HTMLElement>("[data-retained-app-view]")!;
    board.scrollTop = 42;
    expect(liveEffects).toBe(1);
    state.path = "/settings";
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

  it("bounds retained weight and releases closed tabs", async () => {
    await render();
    for (const [id, path] of [["other", "/projects/p2"], ["fourth", "/projects/p3"], ["pages", "/projects/p4"]]) {
      Object.assign(state, { activeId: id, path, activeHref: path });
      await render();
    }
    expect(container.querySelectorAll("[data-retained-app-view]")).toHaveLength(4);
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
    state.activeHref = "/settings";
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

  it("qualifies only the exact retained tab and repeatable selection for local navigation", () => {
    const route = { pathname: "/all", search: "view=first", projectId: null };
    const views = retainAppView([], route, "board", new Set(["board"]));
    expect(isRetainedDestination(views, "board", "/all?view=first")).toBe(true);
    expect(isRetainedDestination(views, "other", "/all?view=first")).toBe(false);
    expect(isRetainedDestination(views, "board", "/all?view=second")).toBe(false);
    expect(isRetainedDestination(views, "board", "/projects/p/pages")).toBe(false);
    expect(isRetainedDestination(views, "board", "https://external.test/all")).toBe(false);
    const consumed = [{ ...views[0], route: { ...route, search: "" }, href: "/all?view=first" }];
    expect(isRetainedDestination(consumed, "board", "/all?view=first")).toBe(true);
    expect(isRetainedDestination(consumed, "board", "/all?view=second")).toBe(false);
  });

  it.each([2, 4, 6])("adapts to late frequent visits across twelve tabs under budget %s", (budget) => {
    const open = new Set(Array.from({ length: 12 }, (_, i) => `t${i}`));
    let views: ReturnType<typeof retainAppView> = [];
    let visits: string[] = [];
    const sequence = [...Array.from({ length: 12 }, (_, i) => i), ...Array.from({ length: 10 }, (_, i) => [10, 11, i % 3]).flat()];
    let misses = 0;
    for (const index of sequence) {
      const tabId = `t${index}`;
      const route = { pathname: `/projects/p${index}`, search: "", projectId: `p${index}` };
      if (!views.some((view) => view.tabId === tabId)) misses++;
      visits = [...visits, tabId].slice(-32);
      views = retainAppView(views, route, tabId, open, { budget, limit: 6, visits, cost: () => 1 });
      expect(views.length).toBeLessThanOrEqual(budget);
      expect(views.at(-1)?.tabId).toBe(tabId);
    }
    if (budget >= 4) {
      expect(views.map((view) => view.tabId)).toContain("t10");
      expect(views.map((view) => view.tabId)).toContain("t11");
      // Twelve compulsory first visits plus fewer misses than the 30 returns
      // that a two-slot LRU would miss in this three-destination pattern.
      expect(misses).toBeLessThan(30);
    }
    // A new visit pattern replaces formerly frequent tabs rather than pinning them.
    for (let i = 0; i < 40; i++) {
      const tabId = `t${i % 3}`;
      visits = [...visits, tabId].slice(-32);
      views = retainAppView(views, { pathname: `/projects/p${i % 3}`, search: "", projectId: `p${i % 3}` }, tabId, open, { budget, limit: 6, visits, cost: () => 1 });
    }
    // An unused spare slot may retain one older view; neither old favourite can
    // displace the three newly frequent destinations when the budget fits them.
    if (budget === 4) expect(views.filter((view) => ["t10", "t11"].includes(view.tabId!)).length).toBeLessThanOrEqual(1);
    if (budget === 2) expect(views.filter((view) => ["t10", "t11"].includes(view.tabId!))).toHaveLength(0);
  });
});

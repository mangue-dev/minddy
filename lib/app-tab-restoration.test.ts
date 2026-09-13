// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBoardViews } from "./use-board-views";
import { useAppTabLocalState } from "./app-tab-local-state";
import { useAppTabChange } from "./use-app-tab-change";
import { DEFAULT_CONFIG } from "./view-filter";
import type { View } from "./types";

const context = vi.hoisted(() => ({ activeId: "a" as string | null, values: new Map<string, unknown>(), views: [] as View[] }));
vi.mock("./app-tabs-context", () => ({ useOptionalAppTabs: () => ({
  activeId: context.activeId,
  session: { getLocalState: (key: string) => context.values.get(key), setLocalState: (key: string, value: unknown) => context.values.set(key, value) },
}) }));
vi.mock("./use-views-query", () => ({ useViewsQuery: () => ({ views: context.views, loading: false }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("mangue-ui", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let root: Root;
let element: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  context.activeId = "a"; context.values.clear(); localStorage.clear();
  context.views = ["view-a", "view-b"].map((id, position) => ({
    id, position, ...DEFAULT_CONFIG, name: id, kind: "custom", project_id: null,
    user_id: null, created_at: "", updated_at: "",
  }));
  element = document.createElement("div"); document.body.append(element); root = createRoot(element);
});
afterEach(async () => { await act(() => root.unmount()); element.remove(); });

describe("application tab page restoration", () => {
  it("falls back to an available view when the remembered view was deleted", async () => {
    context.values.set("a:minddy:view:global", { id: "deleted", config: DEFAULT_CONFIG });
    let selected: string | null = null;
    function Board() {
      selected = useBoardViews({ kind: "global" }, { viewParam: "deleted", onViewParamConsumed: vi.fn() }).activeViewId;
      return null;
    }
    await act(() => root.render(createElement(Board)));
    expect(selected).toBe("view-a");
  });
  it("closes transient panels on activation, but preserves the initial notification panel", async () => {
    context.activeId = null;
    const close = vi.fn();
    function Panel() { useAppTabChange(close); return null; }
    const render = () => act(() => root.render(createElement(Panel)));
    await render(); context.activeId = "a"; await render();
    expect(close).not.toHaveBeenCalled();
    context.activeId = "b"; await render(); expect(close).toHaveBeenCalledOnce();
    await render(); expect(close).toHaveBeenCalledOnce();
  });
  it("keeps independent working filters through same-route activation and delayed URL consumption", async () => {
    let board!: ReturnType<typeof useBoardViews>;
    const consume = vi.fn();
    function Board({ param }: { param: string | null }) {
      board = useBoardViews({ kind: "global" }, { viewParam: param, onViewParamConsumed: consume });
      return null;
    }
    const render = (param: string | null) => act(() => root.render(createElement(Board, { param })));
    await render("view-a"); await render(null);
    await act(() => board.setConfig({ ...DEFAULT_CONFIG, sort: "priority" }));
    context.activeId = "b";
    await render(null); await render("view-b"); await render(null);
    expect(board.activeViewId).toBe("view-b");
    await act(() => board.setConfig({ ...DEFAULT_CONFIG, sort: "created" }));
    context.activeId = "a";
    await render(null); await render("view-a"); await render(null);
    expect(board.activeViewId).toBe("view-a");
    expect(board.config.sort).toBe("priority");
    expect(board.dirty).toBe(true);
    context.activeId = "b";
    await render(null); await render("view-b"); await render(null);
    expect(board.config.sort).toBe("created");
  });

  it("restores the selected cycle independently and supports functional updates", async () => {
    let state!: ReturnType<typeof useAppTabLocalState<string | null>>;
    function Selection() { state = useAppTabLocalState<string | null>("cycle", null); return null; }
    const render = () => act(() => root.render(createElement(Selection)));
    await render(); await act(() => state[1]("past-cycle"));
    context.activeId = "b"; await render(); expect(state[0]).toBeNull();
    await act(() => state[1]((previous) => previous ?? "future-cycle"));
    context.activeId = "a"; await render(); expect(state[0]).toBe("past-cycle");
    context.activeId = "b"; await render(); expect(state[0]).toBe("future-cycle");
  });
  it("hands a consumed startup selection to the first tab after the account list loads", async () => {
    context.activeId = null;
    let state!: ReturnType<typeof useAppTabLocalState<boolean>>;
    function Selection() { state = useAppTabLocalState("cycle-mode", false); return null; }
    await act(() => root.render(createElement(Selection)));
    await act(() => state[1](true));
    context.activeId = "a";
    await act(() => root.render(createElement(Selection)));
    expect(state[0]).toBe(true);
    context.activeId = "b";
    await act(() => root.render(createElement(Selection)));
    expect(state[0]).toBe(false);
  });
});

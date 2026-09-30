// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBoardViews } from "./use-board-views";
import { useViewsQuery, type ViewScope } from "./use-views-query";
import { DEFAULT_CONFIG } from "./view-filter";
import type { View, ViewConfig } from "./types";
import { fetchViewsApi, updateViewApi } from "./views-api";

vi.mock("./views-api", () => ({ fetchViewsApi: vi.fn(), updateViewApi: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("mangue-ui", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./app-tabs-context", () => ({ useOptionalAppTabNavigation: () => null }));

const saved: View = {
  id: "view", project_id: null, kind: "custom", user_id: "user", name: "Everything",
  ...DEFAULT_CONFIG, position: 0, created_at: "initial", updated_at: "initial",
};
const edited: ViewConfig = { filters: { priority: ["high"] }, sort: "priority", display: { hideDone: true } };
const newer: ViewConfig = { ...edited, filters: { priority: ["urgent"] } };
let root: Root;
let client: QueryClient;
let container: HTMLDivElement;
let board: ReturnType<typeof useBoardViews>;
let views: ReturnType<typeof useViewsQuery>;
let scope: ViewScope;
const onViewParamConsumed = () => {};
function Harness() {
  board = useBoardViews(scope, { viewParam: null, onViewParamConsumed });
  views = useViewsQuery(scope);
  return createElement("span", null, String(board.dirty));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = async () => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
};
async function mount(nextScope: ViewScope, extra: View[] = []) {
  scope = nextScope;
  const scopeId = scope.kind === "global" ? "global" : scope.projectId;
  const initial = [{ ...saved, project_id: scope.kind === "global" ? null : scopeId }, ...extra];
  client.setQueryData(["views", scopeId], initial);
  vi.mocked(fetchViewsApi).mockResolvedValue(initial);
  await act(() => root.render(createElement(QueryClientProvider, { client }, createElement(Harness))));
  await flush();
  await act(() => board.setConfig(edited));
  expect(board.dirty).toBe(true);
  return scopeId;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  window.localStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
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

describe.each<ViewScope>([{ kind: "global" }, { kind: "project", projectId: "project" }])("optimistic board save (%j)", (nextScope) => {
  it("clears dirty immediately and reconciles the confirmed view", async () => {
    const scopeId = await mount(nextScope);
    const request = deferred<View>();
    vi.mocked(updateViewApi).mockReturnValueOnce(request.promise);
    let saving!: Promise<void>;
    await act(() => { saving = board.saveActiveView(); });
    await flush();
    expect(board.dirty).toBe(false);
    expect(board.activeView).toMatchObject(edited);
    expect(client.getQueryData<View[]>(["views", scopeId])?.[0]).toMatchObject(edited);
    const confirmed = { ...saved, ...edited, name: "Confirmed", updated_at: "confirmed" };
    vi.mocked(fetchViewsApi).mockResolvedValue([confirmed]);
    await act(async () => { request.resolve(confirmed); await saving; });
    await flush();
    expect(board.activeView?.name).toBe("Confirmed");
    expect(board.dirty).toBe(false);
  });

  it("restores the baseline after failure and preserves working filters for retry", async () => {
    await mount(nextScope);
    const request = deferred<View>();
    vi.mocked(updateViewApi).mockReturnValueOnce(request.promise);
    let saving!: Promise<void>;
    await act(() => { saving = board.saveActiveView(); });
    await flush();
    expect(board.dirty).toBe(false);
    await act(async () => { request.reject(new Error("Save failed")); await saving; });
    await flush();
    expect(board.activeView).toMatchObject(DEFAULT_CONFIG);
    expect(board.config).toEqual(edited);
    expect(board.dirty).toBe(true);
  });

  it.each(["success", "failure"])("preserves edits made while a save is pending (%s)", async (outcome) => {
    await mount(nextScope);
    const request = deferred<View>();
    vi.mocked(updateViewApi).mockReturnValueOnce(request.promise);
    let saving!: Promise<void>;
    await act(() => { saving = board.saveActiveView(); });
    await flush();
    await act(() => board.setConfig(newer));
    await act(async () => {
      if (outcome === "success") {
        const confirmed = { ...saved, ...edited, updated_at: "confirmed" };
        vi.mocked(fetchViewsApi).mockResolvedValue([confirmed]);
        request.resolve(confirmed);
      } else request.reject(new Error("Save failed"));
      await saving;
    });
    await flush();
    expect(board.config).toEqual(newer);
    expect(board.dirty).toBe(true);
  });
});

it("rolls back only the failed view while another view is being saved", async () => {
  await mount({ kind: "global" }, [{ ...saved, id: "other" }]);
  const first = deferred<View>();
  const second = deferred<View>();
  vi.mocked(updateViewApi).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  let saving!: Promise<void>;
  let renaming!: Promise<View>;
  await act(() => { saving = board.saveActiveView(); renaming = views.updateView("other", { name: "Renamed" }); });
  await flush();
  await act(async () => { first.reject(new Error("Save failed")); await saving; });
  await flush();
  expect(board.config).toEqual(edited);
  expect(views.views.find((view) => view.id === "other")?.name).toBe("Renamed");
  expect(board.activeView).toMatchObject(DEFAULT_CONFIG);
  const confirmed = { ...saved, id: "other", name: "Renamed" };
  vi.mocked(fetchViewsApi).mockResolvedValue([saved, confirmed]);
  await act(async () => { second.resolve(confirmed); await renaming; });
  await flush();
  expect(views.views.find((view) => view.id === "other")?.name).toBe("Renamed");
});

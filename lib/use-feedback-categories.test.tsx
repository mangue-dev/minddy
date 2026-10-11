// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { useFeedbackCategories } from "./use-feedback-categories";

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("patches every project list and refetches category membership after a debounced save", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const list = { posts: [{ id: "post", category_ids: ["old"] }], board_enabled: true };
  const defaultKey = ["feedback", "project"];
  const filteredKey = ["feedback", "project", { category: ["old"] }];
  client.setQueryData(defaultKey, list);
  client.setQueryData(filteredKey, list);
  client.setQueryData(["feedback", "other"], list);
  const refetch = vi.fn(async () => ({ ...list, posts: [] }));
  const observer = new QueryObserver(client, { queryKey: filteredKey, queryFn: refetch, staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => {});
  let settle!: () => void;
  const save = vi.fn(() => new Promise<void>((resolve) => { settle = resolve; }));
  const error = vi.fn();
  let change!: (ids: string[]) => void;
  function Controls() { change = useFeedbackCategories("project", "post", save, error); return null; }
  root = createRoot(document.createElement("div"));
  await act(() => root!.render(<QueryClientProvider client={client}><Controls /></QueryClientProvider>));
  await act(() => { change(["first"]); change(["new"]); });
  expect(client.getQueryData(defaultKey)).toEqual({ ...list, posts: [{ id: "post", category_ids: ["new"] }] });
  expect(client.getQueryData(filteredKey)).toEqual(client.getQueryData(defaultKey));
  expect(client.getQueryData(["feedback", "other"])).toEqual(list);
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(save).toHaveBeenCalledExactlyOnceWith(["new"]);
  expect(refetch).not.toHaveBeenCalled();
  await act(async () => { settle(); await Promise.resolve(); });
  expect(refetch).toHaveBeenCalledOnce();
  expect(client.getQueryData(filteredKey)).toEqual({ ...list, posts: [] });
  expect(client.getQueryState(defaultKey)?.isInvalidated).toBe(true);
  expect(error).not.toHaveBeenCalled();
  unsubscribe();
  client.clear();
});

it("flushes on unmount and invalidates filtered lists when saving fails", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const client = new QueryClient();
  const key = ["feedback", "project", { statuses: ["open"] }];
  client.setQueryData(key, { posts: [] });
  const failure = new Error("Write failed");
  const save = vi.fn(async () => { throw failure; });
  const error = vi.fn();
  let change!: (ids: string[]) => void;
  function Controls() { change = useFeedbackCategories("project", "post", save, error); return null; }
  root = createRoot(document.createElement("div"));
  await act(() => root!.render(<QueryClientProvider client={client}><Controls /></QueryClientProvider>));
  await act(() => change(["new"]));
  await act(() => root!.unmount());
  root = undefined;
  expect(save).toHaveBeenCalledExactlyOnceWith(["new"]);
  expect(error).toHaveBeenCalledWith(failure);
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  await vi.advanceTimersByTimeAsync(300);
  expect(save).toHaveBeenCalledOnce();
  client.clear();
});

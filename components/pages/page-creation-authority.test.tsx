// @vitest-environment jsdom
import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePageAutosave, type PageAutosave } from "./use-page-autosave";
import { buildOptimisticPage } from "@/lib/optimistic-page";
import { createPageApi, duplicatePageApi, fetchPageApi, fetchPagesApi, updatePageApi, type UpdatePageInput } from "@/lib/pages-api";
import { createPageSurfaceRead, fetchPageNavigationData, pageKey, pagesKey, usePagesQuery, usePageSurfaceReady,
  type PageCreation, type UsePagesResult } from "@/lib/use-pages-query";
import { observePageReadFailures, pageReadState } from "@/lib/page-read-receipts";
import type { Page } from "@/lib/pages";
import type { PageDocJSON } from "@/lib/pages-merge";

vi.mock("@/lib/pages-api", async (original) => ({ ...await original<typeof import("@/lib/pages-api")>(),
  createPageApi: vi.fn(), duplicatePageApi: vi.fn(), fetchPageApi: vi.fn(), fetchPagesApi: vi.fn(), updatePageApi: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
const clients: QueryClient[] = [];
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  clients.splice(0).forEach((client) => client.clear());
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const body: PageDocJSON = { type: "doc", content: [{ type: "paragraph", attrs: { blockId: "local" },
  content: [{ type: "text", text: "Local draft before creation settles" }] }] };

describe("normal Page creation write authority", () => {
  it("preserves a newer actual PATCH acceptance when an earlier GET arrives afterward", async () => {
    const source = { ...buildOptimisticPage("project", { id: "source" }, []), version: 5 };
    const reading = deferred<Page>();
    vi.mocked(fetchPageApi).mockImplementation(() => reading.promise);
    const saved = { ...source, content: body, version: 6 };
    vi.mocked(updatePageApi).mockResolvedValue(saved);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    observePageReadFailures(client); clients.push(client);
    client.setQueryData(pagesKey("project"), [source]);
    client.setQueryData(pageKey("source"), source);
    let pages!: UsePagesResult;
    function Producer() { pages = usePagesQuery("project"); return null; }
    root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => root!.render(createElement(QueryClientProvider, { client, children: createElement(Producer) })));
    const reader = createPageSurfaceRead(client, "project", "source");
    const lateGet = fetchPageNavigationData(client, "project", "source");
    await act(async () => { expect(await pages.updatePage("source", { content: body, version: 5 })).toEqual(saved); });
    reading.resolve(source);
    expect(await lateGet).toEqual(saved);
    expect(client.getQueryData(pageKey("source"))).toEqual(saved);
    expect(reader.hasAccepted(saved)).toBe(true);
  });

  it.each([
    { operation: "creation", pending: true }, { operation: "creation", pending: false },
    { operation: "duplication", pending: true }, { operation: "duplication", pending: false },
  ])("keeps the real $operation producer usable (pending POST: $pending)", async ({ operation, pending }) => {
    const source = buildOptimisticPage("project", { id: "source" }, []);
    const creation = deferred<Page>();
    vi.mocked(createPageApi).mockImplementation(() => creation.promise);
    vi.mocked(duplicatePageApi).mockImplementation(() => creation.promise);
    vi.mocked(fetchPagesApi).mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    observePageReadFailures(client); clients.push(client);
    client.setQueryData(pagesKey("project"), [source]);
    client.setQueryData(pageKey("source"), source);
    let pages!: UsePagesResult;
    function Producer() { pages = usePagesQuery("project"); return null; }
    const render = async (component: typeof Producer | (() => null)) => {
      await act(async () => root!.render(createElement(QueryClientProvider, { client, children: createElement(component) })));
    };
    root = createRoot(document.body.appendChild(document.createElement("div")));
    await render(Producer);
    let created!: PageCreation;
    await act(async () => { created = operation === "creation" ? await pages.createPage() : await pages.duplicatePage("source"); });
    const canonical = { ...source, id: created.id, version: 1 };
    vi.mocked(updatePageApi).mockImplementation(async (_project, _id, patch) => ({ ...canonical, ...patch, version: 2 }));
    if (!pending) await act(async () => { creation.resolve(canonical); await created.settled; });

    const reader = createPageSurfaceRead(client, "project", created.id);
    let autosave!: PageAutosave;
    let fresh = false;
    function Surface() {
      const query = useQuery({ queryKey: pageKey(created.id), queryFn: reader.queryFn, staleTime: 10_000,
        refetchOnMount: (state) => !state.state.isInvalidated && reader.canUsePrepared(state.state.data, state.state.dataUpdatedAt) ? false : "always" });
      fresh = usePageSurfaceReady(created.id, query.dataUpdatedAt, query.isFetchedAfterMount && reader.hasAccepted(query.data),
        !!client.getQueryState(pageKey(created.id))?.isInvalidated, reader.canUsePrepared(query.data, query.dataUpdatedAt));
      const editorRef = useRef<Editor | null>(null);
      autosave = usePageAutosave({ pageId: created.id, page: query.data, fresh, acquireFresh: reader.acquire,
        readError: query.error ?? reader.failure(), delayMs: 60_000, save: pages.updatePage, editorRef, onError: vi.fn() });
      return null;
    }
    await render(Surface);
    expect(fresh).toBe(true);
    expect(fetchPageApi).not.toHaveBeenCalled();
    let departure!: Promise<boolean>;
    await act(async () => { autosave.schedule({ content: body }); departure = autosave.flushBeforeNavigation(); });
    if (pending) {
      expect(updatePageApi).not.toHaveBeenCalled();
      await act(async () => { creation.resolve(canonical); await created.settled; });
    }
    await act(async () => { expect(await departure).toBe(true); });
    expect(updatePageApi).toHaveBeenCalledWith("project", created.id, { content: body, version: 1 } satisfies UpdatePageInput);
    expect(fetchPageApi).not.toHaveBeenCalled();
    const query = client.getQueryCache().find({ queryKey: pageKey(created.id), exact: true });
    expect(pageReadState(query)?.accepted?.source).toBe("creation");
  });
});

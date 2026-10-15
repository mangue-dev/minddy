// @vitest-environment jsdom
import { act, createElement, StrictMode, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePageAutosave, type PageAutosave } from "./use-page-autosave";
import { buildOptimisticPage } from "@/lib/optimistic-page";
import { PageApiError, createPageApi, duplicatePageApi, fetchPageApi, fetchPagesApi, updatePageApi, type UpdatePageInput } from "@/lib/pages-api";
import { createPageSurfaceRead, fetchPageNavigationData, pageKey, pagesKey, usePagesQuery, usePageSurfaceReady,
  type PageCreation, type UsePagesResult } from "@/lib/use-pages-query";
import { observePageReadFailures, pageReadState } from "@/lib/page-read-receipts";
import type { Page } from "@/lib/pages";
import type { PageDocJSON } from "@/lib/pages-merge";
import { beginPageWrite, isAcceptedPageEcho, queuePageWrite } from "@/lib/optimistic-page-writes";

vi.mock("@/lib/pages-api", async (original) => ({ ...await original<typeof import("@/lib/pages-api")>(),
  createPageApi: vi.fn(), duplicatePageApi: vi.fn(), fetchPageApi: vi.fn(), fetchPagesApi: vi.fn(), updatePageApi: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
const clients: QueryClient[] = [];
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  clients.splice(0).forEach((client) => client.clear());
  vi.resetAllMocks();
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
  it.each(["queue", "creation"])("does not dispatch a retired autosave after the %s wait", async (waiting) => {
    const source = { ...buildOptimisticPage("project", { id: "source", title: "Original title" }, []), version: 5 };
    const creation = deferred<Page>();
    vi.mocked(createPageApi).mockImplementation(() => creation.promise);
    vi.mocked(fetchPagesApi).mockResolvedValue([source]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    clients.push(client);
    client.setQueryData(pagesKey("project"), [source]);
    client.setQueryData(pageKey(source.id), source);
    let pages!: UsePagesResult;
    function Producer() { pages = usePagesQuery("project"); return null; }
    root = createRoot(document.body.appendChild(document.createElement("div")));
    const render = async (surface: () => null) => {
      await act(async () => root!.render(createElement(QueryClientProvider, { client, children: createElement(surface) })));
    };
    await render(Producer);
    let created: PageCreation | undefined;
    if (waiting === "creation") await act(async () => { created = await pages.createPage(); });
    const target = created ? { ...source, id: created.id, version: 1, title: "" } : source;
    const previous = deferred<void>();
    const queued = waiting === "queue" ? queuePageWrite(client, `page:project:${target.id}`, () => previous.promise) : undefined;
    let autosave!: PageAutosave;
    const save = vi.fn(pages.updatePage);
    const onError = vi.fn();
    function Surface() {
      const editorRef = useRef<Editor | null>(null);
      autosave = usePageAutosave({ pageId: target.id, page: target, fresh: true, delayMs: 60_000, save, onError, editorRef });
      return null;
    }
    await render(Surface);
    let departure!: Promise<boolean>;
    await act(async () => {
      autosave.schedule({ title: "Queued optimistic title", content: body });
      departure = autosave.flushBeforeNavigation();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(client.getQueryData<Page>(pageKey(target.id))?.title).toBe("Queued optimistic title");
    expect(updatePageApi).not.toHaveBeenCalled();
    await act(async () => autosave.schedule({ title: "Newest retained title" }));
    await act(async () => root!.unmount()); root = undefined;
    // A replacement account owns another client; releasing the former owner's
    // queue or creation must not send its pending PATCH with the new session.
    const replacement = new QueryClient(); clients.push(replacement);
    replacement.setQueryData(pageKey(target.id), { ...target, title: "Replacement account data" });
    await act(async () => {
      if (created) { creation.resolve(target); await created.settled; }
      else { previous.resolve(); await queued; }
      expect(await departure).toBe(false);
    });
    expect(updatePageApi).not.toHaveBeenCalled();
    expect(client.getQueryData<Page>(pageKey(target.id))?.title).toBe(target.title);
    expect(replacement.getQueryData<Page>(pageKey(target.id))?.title).toBe("Replacement account data");
    expect(autosave.hasUnsavedChanges()).toBe(true);
    expect(autosave.takePending()).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("retires an already queued transport callback across StrictMode restart and retains the newest draft", async () => {
    const source = { ...buildOptimisticPage("project", { id: "strict-source", title: "Original title" }, []), version: 5 };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    clients.push(client);
    client.setQueryData(pagesKey("project"), [source]);
    client.setQueryData(pageKey(source.id), source);
    const previous = deferred<void>();
    const queued = queuePageWrite(client, `page:project:${source.id}`, () => previous.promise);
    vi.mocked(updatePageApi).mockImplementation(async (_project, _id, patch) => ({ ...source, ...patch, version: 6 }));
    let autosave!: PageAutosave;
    let oldDeparture!: Promise<boolean>;
    function Surface() {
      const pages = usePagesQuery("project");
      const editorRef = useRef<Editor | null>(null);
      autosave = usePageAutosave({ pageId: source.id, page: source, fresh: true, delayMs: 60_000,
        save: pages.updatePage, onError: vi.fn(), editorRef });
      const started = useRef(false);
      useEffect(() => {
        if (started.current) return;
        started.current = true;
        autosave.schedule({ title: "Old queued title", content: body });
        oldDeparture = autosave.flushBeforeNavigation();
        autosave.schedule({ title: "Newest retained title" });
      }, []);
      return null;
    }
    root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => root!.render(createElement(StrictMode, {}, createElement(QueryClientProvider,
      { client, children: createElement(Surface) }))));
    await act(async () => { previous.resolve(); await queued; expect(await oldDeparture).toBe(false); });
    expect(updatePageApi).not.toHaveBeenCalled();
    expect(client.getQueryData<Page>(pageKey(source.id))?.title).toBe(source.title);
    expect(autosave.hasUnsavedChanges()).toBe(true);
    await act(async () => { expect(await autosave.flushBeforeNavigation()).toBe(true); });
    expect(updatePageApi).toHaveBeenCalledExactlyOnceWith("project", source.id,
      { content: body, title: "Newest retained title", version: 5 } satisfies UpdatePageInput);
    expect(autosave.hasUnsavedChanges()).toBe(false);
  });

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

  it("recognizes the realtime echo of an accepted body PATCH in this account only", async () => {
    const source = { ...buildOptimisticPage("project", { id: "source" }, []), version: 5 };
    const saved = { ...source, content: body, version: 6, updated_at: "2026-10-15T10:00:00.123456+00:00" };
    vi.mocked(updatePageApi).mockResolvedValue(saved);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    clients.push(client);
    client.setQueryData(pagesKey("project"), [source]);
    client.setQueryData(pageKey("source"), source);
    let pages!: UsePagesResult;
    function Producer() { pages = usePagesQuery("project"); return null; }
    root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => root!.render(createElement(QueryClientProvider, { client, children: createElement(Producer) })));
    await act(async () => { await pages.updatePage("source", { content: body, version: 5 }); });
    const echo = { id: "source", version: 6, updated_at: saved.updated_at };
    expect(isAcceptedPageEcho(client, echo, true)).toBe(true);
    expect(isAcceptedPageEcho(new QueryClient(), echo, false)).toBe(false);
    expect(isAcceptedPageEcho(client, { ...echo, version: 7 }, false)).toBe(false);
  });

  it.each(["older-ack", "newer-ack"] as const)("orders actual same-version metadata by server timestamp (%s)", async (order) => {
    const source = { ...buildOptimisticPage("project", { id: "source", title: "Initial" }, []), version: 7, content: body,
      updated_at: "2026-10-14T00:00:00.100000Z" };
    const saved = { ...source, title: "Accepted local title", updated_at: "2026-10-14T00:00:00.200001Z" };
    const newer = { ...source, title: "Actual GET title",
      updated_at: order === "older-ack" ? "2026-10-14T00:00:00.200002Z" : "2026-10-14T00:00:00.200000Z" };
    const acknowledgement = deferred<Page>();
    vi.mocked(updatePageApi).mockImplementationOnce(() => acknowledgement.promise);
    vi.mocked(fetchPageApi).mockResolvedValue(newer);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    observePageReadFailures(client); clients.push(client);
    client.setQueryData(pagesKey("project"), [source]); client.setQueryData(pageKey(source.id), source);
    let pages!: UsePagesResult;
    function Producer() { pages = usePagesQuery("project"); return null; }
    root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => root!.render(createElement(QueryClientProvider, { client, children: createElement(Producer) })));
    let request!: Promise<Page>;
    await act(async () => { request = pages.updatePage(source.id, { title: saved.title }); });
    await act(async () => { expect(await client.fetchQuery({ queryKey: pageKey(source.id),
      queryFn: ({ signal }) => fetchPageNavigationData(client, "project", source.id, signal), staleTime: 0 })).toEqual(newer); });
    await act(async () => { acknowledgement.resolve(saved); expect(await request).toBe(saved); });
    const expected = order === "older-ack" ? newer : saved;
    expect(client.getQueryData(pageKey(source.id))).toEqual(expected);
    const summary = client.getQueryData<Page[]>(pagesKey("project"))!.find((row) => row.id === source.id)!;
    expect(summary.title).toBe(expected.title);
    expect(summary.updated_at).toBe(expected.updated_at);
  });

  it.each([
    { kind: "schema", outcome: "failure" }, { kind: "schema", outcome: "accepted" },
    { kind: "value", outcome: "failure" }, { kind: "value", outcome: "accepted" },
  ])("keeps independent database $kind settlement after a newer Page read ($outcome)", async ({ kind, outcome }) => {
    const source: Page = { ...buildOptimisticPage("project", { id: "source" }, []), version: 5,
      database_schema: [{ id: "field", name: "Original field", type: "text" }], database_revision: 10,
      property_values: { field: "Original value" } };
    const newer: Page = { ...source, version: 7, content: body,
      database_schema: [{ id: "field", name: "Stale field", type: "text" }], database_revision: 3,
      property_values: { field: "Stale value" } };
    const acknowledgement = deferred<Page>();
    vi.mocked(updatePageApi).mockImplementationOnce(() => acknowledgement.promise);
    vi.mocked(fetchPageApi).mockResolvedValue(newer);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    observePageReadFailures(client); clients.push(client);
    client.setQueryData(pagesKey("project"), [source]); client.setQueryData(pageKey(source.id), source);
    let pages!: UsePagesResult;
    function Producer() { pages = usePagesQuery("project"); return null; }
    root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => root!.render(createElement(QueryClientProvider, { client, children: createElement(Producer) })));
    let pageRequest!: Promise<Page>;
    await act(async () => { pageRequest = pages.updatePage(source.id, { content: body, version: 5 }); });
    const databaseWrite = kind === "schema"
      ? beginPageWrite(client, "project", source, ["database_schema", "database_revision"], (row) => ({ ...row,
        database_schema: [{ id: "field", name: "Pending field", type: "text" }], database_revision: 11 }))
      : beginPageWrite(client, "project", source, ["value:field"], (row) => ({ ...row,
        property_values: { ...row.property_values, field: "Pending value" } }));
    await act(async () => { await client.fetchQuery({ queryKey: pageKey(source.id),
      queryFn: ({ signal }) => fetchPageNavigationData(client, "project", source.id, signal), staleTime: 0 }); });
    expect(databaseWrite.base().database_revision).toBe(10);
    expect(databaseWrite.base().database_schema).toEqual(source.database_schema);
    expect(databaseWrite.base().property_values).toEqual(source.property_values);
    // Database ACKs can share an older document version while independently
    // advancing their revision. Ordinary Page ordering must not reject them.
    const accepted: Page = { ...source, version: 5, database_revision: 12,
      database_schema: [{ id: "field", name: "Accepted field", type: "text" }],
      property_values: { field: "Accepted value" } };
    await act(async () => databaseWrite.settle(outcome === "accepted" ? accepted : undefined));
    const settled = client.getQueryData<Page>(pageKey(source.id))!;
    if (kind === "schema") {
      expect(settled.database_schema).toEqual(outcome === "accepted" ? accepted.database_schema : source.database_schema);
      expect(settled.database_revision).toBe(outcome === "accepted" ? 12 : 10);
    } else expect(settled.property_values?.field).toBe(outcome === "accepted" ? "Accepted value" : "Original value");
    await act(async () => { acknowledgement.resolve({ ...source, version: 6, content: body }); await pageRequest; });
    const afterPageAck = client.getQueryData<Page>(pageKey(source.id))!;
    expect(afterPageAck.version).toBe(7);
    expect(afterPageAck.database_schema).toEqual(settled.database_schema);
    expect(afterPageAck.database_revision).toBe(settled.database_revision);
    expect(afterPageAck.property_values).toEqual(settled.property_values);
  });

  it.each(["newer-read", "newer-denial"] as const)("does not let a retired GET change optimistic rollback after %s", async (outcome) => {
    const source = { ...buildOptimisticPage("project", { id: "source", title: "Accepted initial title" }, []), version: 5 };
    const newer = { ...source, version: 9, title: "Current accepted title" };
    const retired = { ...source, version: outcome === "newer-read" ? 10 : 7, title: "Retired read title" };
    const oldRead = deferred<Page>();
    const denied = new PageApiError("Read access denied", 403);
    vi.mocked(fetchPageApi).mockImplementationOnce(() => oldRead.promise).mockImplementationOnce(async () => {
      if (outcome === "newer-denial") throw denied;
      return newer;
    });
    let failWrite!: (error: unknown) => void;
    vi.mocked(updatePageApi).mockImplementationOnce(() => new Promise<Page>((_resolve, reject) => { failWrite = reject; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    observePageReadFailures(client); clients.push(client);
    client.setQueryData(pagesKey("project"), [source]); client.setQueryData(pageKey(source.id), source);
    let pages!: UsePagesResult;
    function Producer() { pages = usePagesQuery("project"); return null; }
    root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => root!.render(createElement(QueryClientProvider, { client, children: createElement(Producer) })));
    let request!: Promise<Page>;
    await act(async () => { request = pages.updatePage(source.id, { title: "Unaccepted local title" }); });
    const reader = createPageSurfaceRead(client, "project", source.id);
    // Both promises perform actual scoped reads. The older operation remains
    // unresolved while the same Query accepts a newer read sequence or denial.
    const stale = fetchPageNavigationData(client, "project", source.id);
    await act(async () => {
      const latest = client.fetchQuery({ queryKey: pageKey(source.id),
        queryFn: ({ signal }) => fetchPageNavigationData(client, "project", source.id, signal), staleTime: 0 });
      if (outcome === "newer-denial") await expect(latest).rejects.toBe(denied); else expect(await latest).toEqual(newer);
    });
    await act(async () => { oldRead.resolve(retired); await stale; });
    const failed = new Error("Local title rejected");
    await act(async () => { const rejected = expect(request).rejects.toBe(failed); failWrite(failed); await rejected; });
    const current = client.getQueryData<Page>(pageKey(source.id))!;
    expect(current.title).toBe(outcome === "newer-denial" ? source.title : newer.title);
    expect(current.version).toBe(outcome === "newer-denial" ? source.version : newer.version);
    expect(reader.failure()).toBe(outcome === "newer-denial" ? denied : undefined);
    expect(reader.hasAccepted(current)).toBe(outcome !== "newer-denial");
  });

  it.each([6, 8])("keeps a new optimistic entry based on accepted PATCH8 when stale actual GET%s arrives", async (readVersion) => {
    const source = { ...buildOptimisticPage("project", { id: "source", title: "Initial" }, []), version: 7 };
    const saved = { ...source, title: "Accepted PATCH title", content: body, version: 8, updated_at: "2026-10-14T00:00:00.200002Z" };
    const stale = { ...source, title: "Stale GET title", content: readVersion === 8 ? body : null, version: readVersion,
      updated_at: "2026-10-14T00:00:00.200001Z" };
    let failWrite!: (error: unknown) => void;
    vi.mocked(updatePageApi).mockResolvedValueOnce(saved)
      .mockImplementationOnce(() => new Promise<Page>((_resolve, reject) => { failWrite = reject; }));
    vi.mocked(fetchPageApi).mockResolvedValue(stale);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    observePageReadFailures(client); clients.push(client);
    client.setQueryData(pagesKey("project"), [source]); client.setQueryData(pageKey(source.id), source);
    let pages!: UsePagesResult;
    function Producer() { pages = usePagesQuery("project"); return null; }
    root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => root!.render(createElement(QueryClientProvider, { client, children: createElement(Producer) })));
    await act(async () => { expect(await pages.updatePage(source.id, { title: saved.title, content: body, version: 7 })).toBe(saved); });
    let request!: Promise<Page>;
    await act(async () => { request = pages.updatePage(source.id, { title: "Next unaccepted title" }); });
    await act(async () => { await client.fetchQuery({ queryKey: pageKey(source.id),
      queryFn: ({ signal }) => fetchPageNavigationData(client, "project", source.id, signal), staleTime: 0 }); });
    const failure = new Error("Second PATCH rejected");
    await act(async () => { const rejected = expect(request).rejects.toBe(failure); failWrite(failure); await rejected; });
    expect(client.getQueryData<Page>(pageKey(source.id))).toMatchObject({ title: saved.title, content: body, version: 8 });
    expect(client.getQueryData<Page[]>(pagesKey("project"))?.find((row) => row.id === source.id)?.title).toBe(saved.title);
  });

  it.each([5, 6])("ingests an ordinary ACK6 after an accepted GET%s without changing the returned ACK", async (readVersion) => {
    const source = { ...buildOptimisticPage("project", { id: "source" }, []), version: 5 };
    const saved = { ...source, title: "Accepted title", content: body, version: 6 };
    const read = readVersion === 6 ? saved : source;
    const acknowledgement = deferred<Page>();
    vi.mocked(updatePageApi).mockImplementation(() => acknowledgement.promise);
    vi.mocked(fetchPageApi).mockResolvedValue(read);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    observePageReadFailures(client); clients.push(client);
    client.setQueryData(pagesKey("project"), [source]); client.setQueryData(pageKey(source.id), source);
    let pages!: UsePagesResult;
    function Producer() { pages = usePagesQuery("project"); return null; }
    root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => root!.render(createElement(QueryClientProvider, { client, children: createElement(Producer) })));
    let request!: Promise<Page>;
    await act(async () => { request = pages.updatePage(source.id, { title: saved.title, content: body, version: 5 }); });
    await act(async () => { await client.fetchQuery({ queryKey: pageKey(source.id),
      queryFn: ({ signal }) => fetchPageNavigationData(client, "project", source.id, signal), staleTime: 0 }); });
    await act(async () => { acknowledgement.resolve(saved); expect(await request).toBe(saved); });
    expect(client.getQueryData(pageKey(source.id))).toEqual(saved);
    expect(client.getQueryData<Page[]>(pagesKey("project"))?.find((row) => row.id === source.id)?.version).toBe(6);
  });

  it.each(["ordinary", "denied", "queued-title", "unaccepted-cache"] as const)("keeps a newer authorized GET when an older PATCH acknowledges (%s)", async (outcome) => {
    const source = { ...buildOptimisticPage("project", { id: "source", title: "Original" }, []), version: 5 };
    const acknowledgement = deferred<Page>();
    const saved = { ...source, content: body, version: 6, updated_at: "2026-10-14T00:00:06Z" };
    const remoteBody: PageDocJSON = { type: "doc", content: [{ type: "paragraph", attrs: { blockId: "remote" },
      content: [{ type: "text", text: "Newer accepted remote document" }] }] };
    const newer: Page = { ...saved, title: "Remote title", content: remoteBody, version: 7,
      updated_at: "2026-10-14T00:00:07Z", database_schema: [{ id: "field", name: "Field", type: "text" }],
      database_revision: 12, database_title_name: "Entry", property_values: { field: "Preserved" } };
    let rejectQueued!: (error: unknown) => void;
    const queuedResponse = new Promise<Page>((_resolve, reject) => { rejectQueued = reject; });
    vi.mocked(updatePageApi).mockImplementationOnce(() => acknowledgement.promise)
      .mockImplementationOnce(() => queuedResponse);
    vi.mocked(fetchPageApi).mockResolvedValue(newer);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    observePageReadFailures(client); clients.push(client);
    client.setQueryData(pagesKey("project"), [source]);
    client.setQueryData(pageKey(source.id), source);
    let pages!: UsePagesResult;
    function Producer() { pages = usePagesQuery("project"); return null; }
    root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => root!.render(createElement(QueryClientProvider, { client, children: createElement(Producer) })));
    const reader = createPageSurfaceRead(client, "project", source.id);
    let request!: Promise<Page>;
    await act(async () => { request = pages.updatePage(source.id, { content: body, version: 5 }); });
    expect(updatePageApi).toHaveBeenCalledTimes(1);
    let queued!: Promise<Page>;
    if (outcome === "queued-title") await act(async () => { queued = pages.updatePage(source.id, { title: "Latest queued title" }); });
    // The newer version is installed by the ordinary reader and its real receipt,
    // rather than a manually assigned cache timestamp or version.
    await act(async () => {
      expect(await client.fetchQuery({ queryKey: pageKey(source.id),
        queryFn: ({ signal }) => fetchPageNavigationData(client, "project", source.id, signal), staleTime: 0 })).toEqual(newer);
    });
    expect(reader.hasAccepted(newer)).toBe(true);
    const denied = new PageApiError("Read access denied", 403);
    if (outcome === "denied") await act(async () => {
      vi.mocked(fetchPageApi).mockRejectedValueOnce(denied);
      await expect(client.fetchQuery({ queryKey: pageKey(source.id),
        queryFn: ({ signal }) => fetchPageNavigationData(client, "project", source.id, signal), staleTime: 0 })).rejects.toBe(denied);
    });
    if (outcome === "unaccepted-cache") client.setQueryData(pageKey(source.id), { ...newer, version: 999 });
    await act(async () => { acknowledgement.resolve(saved); expect(await request).toEqual(saved); });
    const current = client.getQueryData<Page>(pageKey(source.id))!;
    if (outcome === "unaccepted-cache") {
      expect(current.version).toBe(6);
      expect(current.content).toEqual(body);
    } else if (outcome === "queued-title") {
      expect(current.title).toBe("Latest queued title");
      expect(current.content).toEqual(remoteBody);
      const failure = new Error("Queued title was not accepted");
      await act(async () => {
        const rejected = expect(queued).rejects.toBe(failure);
        rejectQueued(failure); await rejected;
      });
      const rolledBack = client.getQueryData<Page>(pageKey(source.id))!;
      expect(rolledBack.title).toBe(newer.title);
      expect(rolledBack.version).toBe(7);
      expect(rolledBack.content).toEqual(remoteBody);
    } else {
      expect(current).toEqual(newer);
      const summary = client.getQueryData<Page[]>(pagesKey("project"))!.find((page) => page.id === source.id)!;
      expect(summary.version).toBe(7);
      expect(summary.updated_at).toBe(newer.updated_at);
      expect(reader.failure()).toBe(outcome === "denied" ? denied : undefined);
      expect(reader.hasAccepted(current)).toBe(outcome !== "denied");
    }
    expect(current.database_schema).toEqual(newer.database_schema);
    expect(current.database_revision).toBe(12);
    expect(current.property_values).toEqual(newer.property_values);
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

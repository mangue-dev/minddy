// @vitest-environment jsdom
import { act, createElement, StrictMode, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { Editor, JSONContent } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageEditor } from "./page-editor";
import { usePageAutosave, type PageAutosave } from "./use-page-autosave";
import { buildOptimisticPage } from "@/lib/optimistic-page";
import { PageApiError, PageConflictError, type UpdatePageInput } from "@/lib/pages-api";
import { fetchPageApi } from "@/lib/pages-api";
import { createPageSurfaceRead, fetchPageCreationData, fetchPageNavigationData, pageKey, PageWriteBasisError,
  preparePageNavigation, usePageSurfaceReady } from "@/lib/use-pages-query";
import type { Page } from "@/lib/pages";
import type { PageDocJSON } from "@/lib/pages-merge";
import { observePageReadFailures } from "@/lib/page-read-receipts";
import { trackPageCreation, waitForPageCreation } from "@/lib/page-creation-settlement";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("mangue-ui", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));
vi.mock("@/components/pages/block-gutter", () => ({ BlockGutter: () => null }));
vi.mock("@/components/pages/page-comment-bubble", () => ({ PageCommentBubble: () => null }));
vi.mock("@/components/markdown-link-menu", () => ({ MarkdownLinkMenu: () => null }));
vi.mock("@/lib/pages-api", async (original) => ({ ...await original<typeof import("@/lib/pages-api")>(), fetchPageApi: vi.fn() }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
const clients: QueryClient[] = [];
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  clients.splice(0).forEach((client) => client.clear());
  document.body.innerHTML = "";
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function doc(local = "Original local", remote = "Original remote"): PageDocJSON {
  return { type: "doc", content: [
    { type: "paragraph", attrs: { blockId: "local" }, content: [{ type: "text", text: local }] },
    { type: "paragraph", attrs: { blockId: "remote" }, content: [{ type: "text", text: remote }] },
  ] };
}

function page(version = 5, content = doc()): Page {
  return { ...buildOptimisticPage("project", { id: "cached-page" }, []), version, content };
}

async function mount({ cached = page(), read, save, editor = false, preparation = false, prepared = false, beforeMount }: {
  cached?: Page;
  read: () => Promise<Page>;
  save: (id: string, patch: UpdatePageInput) => Promise<Page>;
  editor?: boolean;
  preparation?: boolean;
  prepared?: boolean;
  beforeMount?: (client: QueryClient) => Promise<void>;
}) {
  let autosave!: PageAutosave;
  let preparedSurfaceReady = false;
  const onError = vi.fn();
  const editorRef = { current: null as Editor | null };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  observePageReadFailures(client);
  clients.push(client);
  vi.mocked(fetchPageApi).mockImplementation(read);
  client.setQueryData(pageKey(cached.id), cached, { updatedAt: Date.now() - (prepared ? 0 : 60_000) });
  if (prepared) preparePageNavigation(cached.id);
  await beforeMount?.(client);
  if (preparation) {
    // The ordinary preparator starts before the surface exists, so its queryFn
    // is the shared authorized reader rather than the new surface's wrapper.
    void client.fetchQuery({ queryKey: pageKey(cached.id),
      queryFn: ({ signal }) => fetchPageNavigationData(client, cached.project_id, cached.id, signal),
      staleTime: 0, retry: false }).catch(() => {});
  }
  const reader = createPageSurfaceRead(client, cached.project_id, cached.id);
  const options = { queryKey: ["page", cached.id], queryFn: reader.queryFn, staleTime: 0, retry: false };
  function Surface() {
    const query = useQuery({ ...options, refetchOnMount: (state) =>
      !state.state.isInvalidated && reader.canUsePrepared(state.state.data, state.state.dataUpdatedAt) ? false : "always" });
    const lastReadError = useRef<unknown>(undefined);
    const hadReadError = useRef(false);
    reader.observeFailure(query.error);
    const observedError = query.error ?? reader.failure();
    if (observedError) lastReadError.current = observedError;
    else if (reader.hasAccepted(query.data)) lastReadError.current = undefined;
    const error = observedError ?? lastReadError.current;
    if (error) hadReadError.current = true;
    preparedSurfaceReady = usePageSurfaceReady(cached.id, query.dataUpdatedAt,
      query.isFetchedAfterMount && reader.hasAccepted(query.data), !!client.getQueryState(pageKey(cached.id))?.isInvalidated,
      reader.canUsePrepared(query.data, query.dataUpdatedAt));
    autosave = usePageAutosave({ pageId: cached.id, page: query.data,
      fresh: preparedSurfaceReady && !error && (!hadReadError.current || reader.hasAccepted(query.data)), readError: error,
      acquireFresh: reader.acquire, delayMs: 60_000, editorRef, save, onError });
    // Use the real editor so remote adoption cannot erase live typing.
    if (error) return createElement("p", { "data-read-error": true }, error instanceof Error ? error.message : "Unable to read Page");
    return editor ? createElement(PageEditor, { initialContent: query.data?.content as JSONContent,
      editorRef, onEditor: (value) => { if (value) autosave.resumeEditor(); },
      onChange: (content) => autosave.schedule({ content }) }) : null;
  }
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(createElement(QueryClientProvider, { client, children: createElement(Surface) })));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  return { get autosave() { return autosave; }, get preparedSurfaceReady() { return preparedSurfaceReady; }, client, editorRef, onError, reader };
}

describe("cached Page display and fresh write authority", () => {
  it("never upgrades a manually bumped cache version into an authorized GET receipt", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const canonical = page(5);
    client.setQueryData(pageKey("cached-page"), canonical);
    vi.mocked(fetchPageApi).mockResolvedValue(canonical);
    await createPageSurfaceRead(client, "project", "cached-page").acquire();
    const forged = page(999, doc("Unaccepted cache body"));
    client.setQueryData(pageKey("cached-page"), forged);
    preparePageNavigation("cached-page");
    const reader = createPageSurfaceRead(client, "project", "cached-page");
    expect(reader.canUsePrepared(forged, client.getQueryState(pageKey("cached-page"))!.dataUpdatedAt)).toBe(false);
    expect(await reader.acquire()).toBe(canonical);
    expect(client.getQueryData(pageKey("cached-page"))).toEqual(canonical);
    expect(reader.hasAccepted(forged)).toBe(false);
    expect(reader.hasAccepted(canonical)).toBe(true);
  });

  it("does not certify a recent prepared cache after its actual GET was canceled before mount", async () => {
    const canceled = deferred<Page>();
    const reading = deferred<Page>();
    const read = vi.fn().mockResolvedValueOnce(page(5)).mockImplementationOnce(() => canceled.promise).mockImplementationOnce(() => reading.promise);
    const save = vi.fn(async (_id: string, patch: UpdatePageInput) => page(7, patch.content as PageDocJSON));
    const h = await mount({ read, save, editor: true, prepared: true, beforeMount: async (client) => {
      await client.fetchQuery({ queryKey: pageKey("cached-page"),
        queryFn: ({ signal }) => fetchPageNavigationData(client, "project", "cached-page", signal), staleTime: 0 });
      const request = client.fetchQuery({ queryKey: pageKey("cached-page"),
        queryFn: ({ signal }) => fetchPageNavigationData(client, "project", "cached-page", signal), staleTime: 0 });
      await client.cancelQueries({ queryKey: pageKey("cached-page"), exact: true });
      expect(await request).toMatchObject({ id: "cached-page", project_id: "project", version: 5, content: doc() });
    } });
    expect(read).toHaveBeenCalledTimes(3);
    expect(h.preparedSurfaceReady).toBe(false);
    expect(h.editorRef.current!.getText()).toContain("Original local");
    await act(async () => h.editorRef.current!.commands.setContent(doc("Draft after canceled intent") as JSONContent));
    let departure!: Promise<boolean>;
    await act(async () => { departure = h.autosave.flushBeforeNavigation(); });
    expect(save).not.toHaveBeenCalled();
    expect(h.autosave.takePending()).toBeNull();
    await act(async () => { reading.resolve(page(6, doc("Original local", "Remote before mount"))); expect(await departure).toBe(true); });
    expect(save).toHaveBeenCalledWith("cached-page", { content: doc("Draft after canceled intent", "Remote before mount"), version: 6 }, expect.any(Function));
    canceled.resolve(page(5));
  });

  it("reuses a current actual prepared GET without another mount read", async () => {
    const read = vi.fn().mockResolvedValue(page(5));
    const save = vi.fn(async (_id: string, patch: UpdatePageInput) => page(6, patch.content as PageDocJSON));
    const h = await mount({ read, save, editor: true, prepared: true, beforeMount: async (client) => {
      await client.fetchQuery({ queryKey: pageKey("cached-page"),
        queryFn: ({ signal }) => fetchPageNavigationData(client, "project", "cached-page", signal), staleTime: 0 });
    } });
    expect(read).toHaveBeenCalledTimes(1);
    expect(h.preparedSurfaceReady).toBe(true);
    await act(async () => {
      h.editorRef.current!.commands.setContent(doc("Immediately editable prepared body") as JSONContent);
      expect(await h.autosave.flushBeforeNavigation()).toBe(true);
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("cached-page", { content: doc("Immediately editable prepared body"), version: 5 }, expect.any(Function));
  });

  it("preserves a queued creation POST and accepts its scoped settlement", async () => {
    const creation = deferred<Page>();
    const read = vi.fn().mockResolvedValue(page(1));
    const serverWrite = vi.fn(async (_id: string, patch: UpdatePageInput) => page(2, patch.content as PageDocJSON));
    const save = async (id: string, patch: UpdatePageInput) => { await waitForPageCreation(id); return serverWrite(id, patch); };
    let request!: Promise<Page>;
    const h = await mount({ cached: page(1), read, save, editor: true, prepared: true, beforeMount: async (client) => {
      request = trackPageCreation("cached-page", client.fetchQuery({ queryKey: pageKey("cached-page"),
        queryFn: () => fetchPageCreationData(client, "project", "cached-page", () => creation.promise), staleTime: 0, retry: false }));
    } });
    expect(read).not.toHaveBeenCalled();
    expect(h.preparedSurfaceReady).toBe(true);
    await act(async () => h.editorRef.current!.commands.setContent(doc("Typed while POST is pending") as JSONContent));
    let departure!: Promise<boolean>;
    await act(async () => { departure = h.autosave.flushBeforeNavigation(); });
    expect(serverWrite).not.toHaveBeenCalled();
    await act(async () => { creation.resolve(page(1)); await request; expect(await departure).toBe(true); });
    expect(serverWrite).toHaveBeenCalledWith("cached-page", { content: doc("Typed while POST is pending"), version: 1 });
    expect(read).not.toHaveBeenCalled();
  });

  it("reuses an actual settled creation POST without a redundant GET", async () => {
    const read = vi.fn().mockResolvedValue(page(1));
    const save = vi.fn(async (_id: string, patch: UpdatePageInput) => page(2, patch.content as PageDocJSON));
    const h = await mount({ cached: page(1), read, save, editor: true, prepared: true, beforeMount: async (client) => {
      await trackPageCreation("cached-page", client.fetchQuery({ queryKey: pageKey("cached-page"),
        queryFn: () => fetchPageCreationData(client, "project", "cached-page", async () => page(1)), staleTime: 0 }));
    } });
    expect(read).not.toHaveBeenCalled();
    expect(h.preparedSurfaceReady).toBe(true);
    await act(async () => {
      h.editorRef.current!.commands.setContent(doc("Typed after POST settlement") as JSONContent);
      expect(await h.autosave.flushBeforeNavigation()).toBe(true);
    });
    expect(save).toHaveBeenCalledWith("cached-page", { content: doc("Typed after POST settlement"), version: 1 }, expect.any(Function));
    expect(read).not.toHaveBeenCalled();
  });

  it("accepts immediate typing, joins mount validation and merges the latest draft before departure", async () => {
    const reading = deferred<Page>();
    const read = vi.fn(() => reading.promise);
    const save = vi.fn(async (_id: string, patch: UpdatePageInput) => page(7, patch.content as PageDocJSON));
    const h = await mount({ read, save, editor: true });
    expect(h.editorRef.current!.getText()).toContain("Original local");
    await act(async () => h.editorRef.current!.commands.setContent(doc("Typed before validation") as JSONContent));
    let departure!: Promise<boolean>;
    let departed = false;
    await act(async () => { departure = h.autosave.flushBeforeNavigation().then((value) => { departed = value; return value; }); });
    expect(departed).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
    // A second keystroke while acquisition is pending belongs to the same draft.
    await act(async () => h.editorRef.current!.commands.setContent(doc("Typed twice before validation") as JSONContent));
    expect(h.autosave.takePending()).toBeNull();
    expect(h.autosave.hasUnsavedChanges()).toBe(true);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    await act(async () => { reading.resolve(page(6, doc("Original local", "Remote edit"))); await departure; });
    expect(departed).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("cached-page", { content: doc("Typed twice before validation", "Remote edit"), version: 6 }, expect.any(Function));
    expect(h.editorRef.current!.getText()).toContain("Typed twice before validation");
    expect(h.editorRef.current!.getText()).toContain("Remote edit");
    expect(h.autosave.hasUnsavedChanges()).toBe(false);
    expect(h.onError).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 500])("preserves the draft and vetoes departure when validation fails (%s)", async (status) => {
    const reading = deferred<Page>();
    const read = vi.fn(() => reading.promise);
    const save = vi.fn();
    const h = await mount({ read, save });
    await act(async () => h.autosave.schedule({ content: doc("Unsaved text") }));
    let departure!: Promise<boolean>;
    await act(async () => { departure = h.autosave.flushBeforeNavigation(); });
    await act(async () => { reading.reject(new PageApiError("Unable to read Page", status)); expect(await departure).toBe(false); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    // The ordinary error UI hides the protected document after denial.
    expect(document.querySelector("[data-read-error]")?.textContent).toBe("Unable to read Page");
    expect(h.autosave.state).toBe("error");
    expect(h.autosave.takePending()).toBeNull();
    expect(h.autosave.hasUnsavedChanges()).toBe(true);
    expect(save).not.toHaveBeenCalled();
    read.mockResolvedValue(page(6, doc("Original local", "Remote after retry")));
    save.mockImplementation(async (_id: string, input: UpdatePageInput) => page(7, input.content as PageDocJSON));
    await act(async () => { expect(await h.autosave.flushBeforeNavigation()).toBe(true); });
    expect(save).toHaveBeenCalledWith("cached-page", { content: doc("Unsaved text", "Remote after retry"), version: 6 }, expect.any(Function));
  });

  it("retains a rebased draft on write failure and retries against the validated version", async () => {
    const reading = deferred<Page>();
    const save = vi.fn().mockRejectedValue(new Error("Write failed"));
    const h = await mount({ read: () => reading.promise, save });
    let departure!: Promise<boolean>;
    await act(async () => {
      h.autosave.schedule({ content: doc("Local text"), title: "Local title" });
      departure = h.autosave.flushBeforeNavigation();
    });
    await act(async () => { reading.resolve(page(6, doc("Original local", "Remote text"))); expect(await departure).toBe(false); });
    expect(h.autosave.hasUnsavedChanges()).toBe(true);
    expect(h.autosave.state).toBe("error");
    save.mockImplementation(async (_id: string, input: UpdatePageInput) => page(7, input.content as PageDocJSON));
    await act(async () => { expect(await h.autosave.flushBeforeNavigation()).toBe(true); });
    expect(save).toHaveBeenLastCalledWith("cached-page", { content: doc("Local text", "Remote text"), title: "Local title", version: 6 }, expect.any(Function));
  });

  it("shares a preparator's already running actual GET without a second validation read", async () => {
    const reading = deferred<Page>();
    const read = vi.fn(() => reading.promise);
    const save = vi.fn(async (_id: string, input: UpdatePageInput) => page(7, input.content as PageDocJSON));
    const h = await mount({ read, save, preparation: true, editor: true });
    let departure!: Promise<boolean>;
    await act(async () => {
      h.editorRef.current!.commands.setContent(doc("Local during prepared read") as JSONContent);
      departure = h.autosave.flushBeforeNavigation();
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    await act(async () => { reading.resolve(page(6, doc("Original local", "Prepared remote"))); expect(await departure).toBe(true); });
    expect(read).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("cached-page", { content: doc("Local during prepared read", "Prepared remote"), version: 6 }, expect.any(Function));
  });

  it.each([{ version: 5, preparation: false }, { version: 6, preparation: false },
    { version: 5, preparation: true }, { version: 6, preparation: true }])(
    "does not trust canceled cached resolution (version $version, preparation $preparation)", async ({ version, preparation }) => {
    const canceled = deferred<Page>();
    const accepted = deferred<Page>();
    const read = vi.fn().mockImplementationOnce(() => canceled.promise).mockImplementationOnce(() => accepted.promise);
    const save = vi.fn(async (_id: string, patch: UpdatePageInput) => page(version + 1, patch.content as PageDocJSON));
    const h = await mount({ read, save, preparation });
    let departure!: Promise<boolean>;
    await act(async () => {
      h.autosave.schedule({ content: doc("Typed before canceled validation") });
      departure = h.autosave.flushBeforeNavigation();
    });
    await act(async () => {
      await h.client.cancelQueries({ queryKey: ["page", "cached-page"], exact: true });
      expect(await departure).toBe(false);
    });
    expect(h.client.getQueryData<Page>(["page", "cached-page"])?.version).toBe(5);
    expect(save).not.toHaveBeenCalled();
    expect(h.autosave.takePending()).toBeNull();
    expect(h.autosave.hasUnsavedChanges()).toBe(true);
    // Completion of the abandoned GET cannot certify the restored cached result.
    await act(async () => { canceled.resolve(page(7)); await Promise.resolve(); });
    expect(save).not.toHaveBeenCalled();
    await act(async () => { departure = h.autosave.flushBeforeNavigation(); });
    expect(read).toHaveBeenCalledTimes(2);
    expect(save).not.toHaveBeenCalled();
    await act(async () => { accepted.resolve(page(version)); expect(await departure).toBe(true); });
    expect(save).toHaveBeenCalledWith("cached-page", { content: doc("Typed before canceled validation"), version }, expect.any(Function));
  });

  it("does not carry read receipts across manual cache changes, eviction or another account client", async () => {
    const first = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const other = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(first, other);
    first.setQueryData(pageKey("cached-page"), page(5));
    other.setQueryData(pageKey("cached-page"), page(5));
    const reader = createPageSurfaceRead(first, "project", "cached-page");
    const otherReader = createPageSurfaceRead(other, "project", "cached-page");
    expect(reader.hasAccepted(page(5))).toBe(false);
    vi.mocked(fetchPageApi).mockResolvedValue(page(5));
    await reader.acquire();
    expect(reader.hasAccepted(page(5))).toBe(true);
    expect(otherReader.hasAccepted(page(5))).toBe(false);
    first.setQueryData(pageKey("cached-page"), page(6));
    expect(reader.hasAccepted(page(6))).toBe(false);
    first.removeQueries({ queryKey: pageKey("cached-page"), exact: true });
    first.setQueryData(pageKey("cached-page"), page(5));
    expect(reader.hasAccepted(page(5))).toBe(false);
    await reader.acquire();
    expect(reader.hasAccepted(page(5))).toBe(true);
  });

  it("does not reuse an earlier receipt when another fetching query only returns cached data", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    client.setQueryData(pageKey("cached-page"), page(5));
    vi.mocked(fetchPageApi).mockResolvedValue(page(5));
    await createPageSurfaceRead(client, "project", "cached-page").acquire();
    const cached = deferred<Page>();
    const withoutGet = client.fetchQuery({ queryKey: pageKey("cached-page"), queryFn: () => cached.promise, staleTime: 0 });
    const surface = createPageSurfaceRead(client, "project", "cached-page");
    const acquisition = surface.acquire();
    cached.resolve(page(5));
    await withoutGet;
    await expect(acquisition).rejects.toBeInstanceOf(PageWriteBasisError);
    expect(surface.hasAccepted(page(5))).toBe(false);
  });

  it.each(["shared", "raw"])("keeps a prepared Page denied after an optimistic cache reset (%s GET)", async (owner) => {
    const read = vi.fn().mockResolvedValue(page(5));
    const save = vi.fn(async (_id: string, patch: UpdatePageInput) => page(6, patch.content as PageDocJSON));
    const h = await mount({ read, save, editor: true, prepared: true, beforeMount: async (client) => {
      await client.fetchQuery({ queryKey: pageKey("cached-page"),
        queryFn: ({ signal }) => fetchPageNavigationData(client, "project", "cached-page", signal), staleTime: 0 });
    } });
    expect(h.preparedSurfaceReady).toBe(true);
    expect(h.reader.canUsePrepared(page(5), h.client.getQueryState(pageKey("cached-page"))!.dataUpdatedAt)).toBe(true);
    await act(async () => h.editorRef.current!.commands.setContent(doc("Local before denial") as JSONContent));
    const denied = new PageApiError("Page access denied", 403);
    read.mockRejectedValue(denied);
    await act(async () => {
      await expect(h.client.fetchQuery({ queryKey: pageKey("cached-page"),
        queryFn: owner === "shared" ? h.reader.queryFn : () => fetchPageApi("project", "cached-page"),
        staleTime: 0, retry: false })).rejects.toBe(denied);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(h.reader.hasAccepted(page(5))).toBe(false);
    expect(h.reader.failure()).toBe(denied);
    expect(document.querySelector("[data-read-error]")?.textContent).toBe("Page access denied");
    expect(document.querySelector(".tiptap")).toBeNull();
    await act(async () => {
      h.client.setQueryData(pageKey("cached-page"), page(5));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(h.client.getQueryState(pageKey("cached-page"))?.error).toBeNull();
    // The old prepared-on-mount shortcut remains true, but cannot clear denial.
    expect(h.preparedSurfaceReady).toBe(true);
    expect(h.reader.hasAccepted(page(5))).toBe(false);
    expect(h.reader.failure()).toBe(denied);
    expect(document.querySelector("[data-read-error]")?.textContent).toBe("Page access denied");
    expect(document.querySelector(".tiptap")).toBeNull();
    expect(h.autosave.takePending()).toBeNull();
    await act(async () => { expect(await h.autosave.flushBeforeNavigation()).toBe(false); });
    expect(save).not.toHaveBeenCalled();
    expect(h.autosave.hasUnsavedChanges()).toBe(true);
    read.mockResolvedValue(page(5));
    await act(async () => {
      expect(await h.autosave.flushBeforeNavigation()).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(h.reader.failure()).toBeUndefined();
    expect(document.querySelector("[data-read-error]")).toBeNull();
    expect(h.editorRef.current!.getText()).toContain("Local before denial");
    expect(save).toHaveBeenCalledWith("cached-page", { content: doc("Local before denial"), version: 5 }, expect.any(Function));
  });

  it("keeps an unobserved raw denial after optimistic cache clearing and before the Page mounts", async () => {
    const denied = new PageApiError("Page access denied", 403);
    const reading = deferred<Page>();
    const read = vi.fn().mockRejectedValueOnce(denied).mockImplementationOnce(() => reading.promise);
    const save = vi.fn(async (_id: string, patch: UpdatePageInput) => page(6, patch.content as PageDocJSON));
    const h = await mount({ read, save, editor: true, prepared: true,
      beforeMount: async (client) => {
        // No reader, hook or QueryObserver exists when this raw owner fails.
        await expect(client.fetchQuery({ queryKey: pageKey("cached-page"),
          queryFn: () => fetchPageApi("project", "cached-page"), staleTime: 0, retry: false })).rejects.toBe(denied);
        client.setQueryData(pageKey("cached-page"), page(5));
        expect(client.getQueryState(pageKey("cached-page"))?.error).toBeNull();
      } });
    expect(h.reader.failure()).toBe(denied);
    expect(h.reader.hasAccepted(page(5))).toBe(false);
    expect(h.preparedSurfaceReady).toBe(false);
    expect(document.querySelector("[data-read-error]")?.textContent).toBe("Page access denied");
    expect(document.querySelector(".tiptap")).toBeNull();
    expect(save).not.toHaveBeenCalled();
    await act(async () => { reading.resolve(page(5)); await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(h.reader.failure()).toBeUndefined();
    expect(document.querySelector("[data-read-error]")).toBeNull();
    expect(h.editorRef.current!.getText()).toContain("Original local");
    await act(async () => {
      h.editorRef.current!.commands.setContent(doc("Typed after validation") as JSONContent);
      expect(await h.autosave.flushBeforeNavigation()).toBe(true);
    });
    expect(save).toHaveBeenCalledWith("cached-page", { content: doc("Typed after validation"), version: 5 }, expect.any(Function));
  });

  it("keeps conflicting local text recoverable while saving independent edits", async () => {
    const reading = deferred<Page>();
    const save = vi.fn(async (_id: string, input: UpdatePageInput) => ({ ...page(7), ...input, version: 7 }));
    const h = await mount({ read: () => reading.promise, save });
    let departure!: Promise<boolean>;
    await act(async () => { h.autosave.schedule({ content: doc("Local contested", "Local independent") }); departure = h.autosave.flushBeforeNavigation(); });
    await act(async () => { reading.resolve(page(6, doc("Remote contested", "Original remote"))); expect(await departure).toBe(true); });
    expect(h.autosave.conflicts).toHaveLength(1);
    expect(JSON.stringify(h.autosave.conflicts[0])).toContain("Local contested");
    expect(save).toHaveBeenCalledWith("cached-page", { content: doc("Remote contested", "Local independent"), version: 6 }, expect.any(Function));
  });

  it("does not grant authority or move the accepted base backwards for an older response", async () => {
    let autosave!: PageAutosave;
    const save = vi.fn();
    const onError = vi.fn();
    const acquireFresh = vi.fn().mockResolvedValue(page(4));
    function Surface() {
      autosave = usePageAutosave({ pageId: "cached-page", page: page(5), fresh: false,
        acquireFresh, save, onError, editorRef: { current: null }, delayMs: 60_000 });
      return null;
    }
    root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => root!.render(createElement(Surface)));
    await act(async () => { autosave.schedule({ content: doc("Still local") }); expect(await autosave.flushBeforeNavigation()).toBe(false); });
    expect(save).not.toHaveBeenCalled();
    expect(autosave.takePending()).toBeNull();
    acquireFresh.mockResolvedValue(page(6));
    save.mockImplementation(async (_id: string, input: UpdatePageInput) => page(7, input.content as PageDocJSON));
    await act(async () => { expect(await autosave.flushBeforeNavigation()).toBe(true); });
    expect(save).toHaveBeenCalledWith("cached-page", { content: doc("Still local"), version: 6 }, expect.any(Function));
  });

  it("rejects a fresh response from another project without sending a write", async () => {
    const reading = deferred<Page>();
    const save = vi.fn();
    const h = await mount({ read: () => reading.promise, save });
    let departure!: Promise<boolean>;
    await act(async () => { h.autosave.schedule({ content: doc("Private draft") }); departure = h.autosave.flushBeforeNavigation(); });
    await act(async () => { reading.resolve({ ...page(6), project_id: "other-project" }); expect(await departure).toBe(false); });
    expect(save).not.toHaveBeenCalled();
    expect(h.autosave.hasUnsavedChanges()).toBe(true);
  });

  it("does not send a queued write after the surface is disposed during acquisition", async () => {
    const reading = deferred<Page>();
    const save = vi.fn();
    const h = await mount({ read: () => reading.promise, save });
    let departure!: Promise<boolean>;
    await act(async () => { h.autosave.schedule({ content: doc("Local draft") }); departure = h.autosave.flushBeforeNavigation(); });
    await act(async () => root!.unmount());
    root = undefined;
    await act(async () => { reading.resolve(page(6)); expect(await departure).toBe(false); });
    expect(save).not.toHaveBeenCalled();
  });

  it.each(["body", "title"])("keeps a queued %s draft after disposal while a ready-basis PATCH is in flight", async (kind) => {
    const acknowledgement = deferred<Page>();
    const save = vi.fn(() => acknowledgement.promise);
    const h = await mount({ read: async () => page(5), save });
    let departure!: Promise<boolean>;
    await act(async () => {
      h.autosave.schedule({ content: doc("Already submitted") });
      departure = h.autosave.flushBeforeNavigation();
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => h.autosave.schedule(kind === "body" ? { content: doc("Still queued") } : { title: "Still queued title" }));
    await act(async () => root!.unmount()); root = undefined;
    await act(async () => { acknowledgement.resolve(page(6, doc("Already submitted"))); expect(await departure).toBe(false); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(h.autosave.hasUnsavedChanges()).toBe(true);
    expect(h.autosave.takePending()).toBeNull();
    await act(async () => { expect(await h.autosave.flushBeforeNavigation()).toBe(false); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(h.onError).not.toHaveBeenCalled();
  });

  it.each(["conflict", "transient"])("does not replay a retired ready-basis PATCH after a %s failure", async (kind) => {
    const response = deferred<Page>();
    const save = vi.fn(() => response.promise);
    const h = await mount({ read: async () => page(5), save });
    let departure!: Promise<boolean>;
    await act(async () => {
      h.autosave.schedule({ content: doc("Submitted local change") });
      departure = h.autosave.flushBeforeNavigation();
      h.autosave.schedule({ content: doc("Latest local draft") });
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => root!.unmount()); root = undefined;
    await act(async () => {
      response.reject(kind === "conflict" ? new PageConflictError("Conflict", page(6, doc("Original local", "Remote update"))) : new Error("Connection interrupted"));
      expect(await departure).toBe(false);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(h.autosave.hasUnsavedChanges()).toBe(true);
    expect(h.autosave.takePending()).toBeNull();
    expect(h.onError).not.toHaveBeenCalled();
  });

  it("does not requeue an accepted in-flight PATCH solely because its owner was disposed", async () => {
    const response = deferred<Page>();
    const save = vi.fn(() => response.promise);
    const h = await mount({ read: async () => page(5), save });
    let departure!: Promise<boolean>;
    await act(async () => { h.autosave.schedule({ content: doc("Accepted once") }); departure = h.autosave.flushBeforeNavigation(); });
    await act(async () => root!.unmount()); root = undefined;
    await act(async () => { response.resolve(page(6, doc("Accepted once"))); expect(await departure).toBe(true); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(h.autosave.hasUnsavedChanges()).toBe(false);
    expect(h.onError).not.toHaveBeenCalled();
  });

  it("fences the previous write generation across StrictMode effect cleanup and restart", async () => {
    const response = deferred<Page>();
    const cached = page(5);
    const save = vi.fn().mockImplementationOnce(() => response.promise)
      .mockImplementation(async (_id: string, patch: UpdatePageInput) => page(7, patch.content as PageDocJSON));
    const onError = vi.fn();
    let autosave!: PageAutosave;
    let oldDeparture!: Promise<boolean>;
    function Surface() {
      autosave = usePageAutosave({ pageId: cached.id, page: cached, fresh: true, delayMs: 60_000,
        save, onError, editorRef: { current: null } });
      const started = useRef(false);
      useEffect(() => {
        if (started.current) return;
        started.current = true;
        autosave.schedule({ content: doc("Submitted before effect restart") });
        oldDeparture = autosave.flushBeforeNavigation();
        autosave.schedule({ content: doc("Queued before effect restart") });
      }, []);
      return null;
    }
    root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => root!.render(createElement(StrictMode, {}, createElement(Surface))));
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { response.resolve(page(6, doc("Submitted before effect restart"))); expect(await oldDeparture).toBe(false); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(autosave.hasUnsavedChanges()).toBe(true);
    // The new owner can explicitly flush the retained latest draft using the
    // already accepted acknowledgement, without replaying the acknowledged body.
    await act(async () => { expect(await autosave.flushBeforeNavigation()).toBe(true); });
    expect(save).toHaveBeenLastCalledWith("cached-page", { content: doc("Queued before effect restart"), version: 6 }, expect.any(Function));
    expect(save).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it("continues an active departure through queued edits before reporting readiness", async () => {
    const response = deferred<Page>();
    const save = vi.fn().mockImplementationOnce(() => response.promise)
      .mockImplementation(async (_id: string, patch: UpdatePageInput) => page(7, patch.content as PageDocJSON));
    const h = await mount({ read: async () => page(5), save });
    let departure!: Promise<boolean>;
    await act(async () => {
      h.autosave.schedule({ content: doc("First active write") });
      departure = h.autosave.flushBeforeNavigation();
      h.autosave.schedule({ content: doc("Latest active write") });
    });
    await act(async () => { response.resolve(page(6, doc("First active write"))); expect(await departure).toBe(true); });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("cached-page", { content: doc("Latest active write"), version: 6 }, expect.any(Function));
    expect(h.autosave.hasUnsavedChanges()).toBe(false);
  });

  it("keeps ordinary version-conflict recovery after fresh acquisition", async () => {
    const reading = deferred<Page>();
    const save = vi.fn().mockRejectedValueOnce(new PageConflictError("Conflict", page(7, doc("Original local", "Latest remote"))))
      .mockImplementation(async (_id: string, input: UpdatePageInput) => page(8, input.content as PageDocJSON));
    const h = await mount({ read: () => reading.promise, save });
    let departure!: Promise<boolean>;
    await act(async () => { h.autosave.schedule({ content: doc("Local text") }); departure = h.autosave.flushBeforeNavigation(); });
    await act(async () => { reading.resolve(page(6)); expect(await departure).toBe(true); });
    expect(save).toHaveBeenLastCalledWith("cached-page", { content: doc("Local text", "Latest remote"), version: 7 }, expect.any(Function));
    expect(h.onError).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLocalPageMetadata, type LocalPageMetadata } from "./use-local-page-metadata";
import { usePageAutosave, type PageAutosave } from "./use-page-autosave";
import { buildOptimisticPage } from "@/lib/optimistic-page";
import type { Page } from "@/lib/pages";
import type { UpdatePageInput } from "@/lib/pages-api";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const page = (version: number, title = "Server"): Page =>
  ({ ...buildOptimisticPage("project", { id: "page" }, []), version, title });

/** The header's precedence, as PageView computes it: local override, then the list line. */
async function mount(save: (id: string, input: UpdatePageInput) => Promise<Page>) {
  let autosave!: PageAutosave;
  let edited!: LocalPageMetadata;
  let setEdited!: (next: LocalPageMetadata) => void;
  let listTitle = "Server";
  const editorRef = { current: null as Editor | null };
  function Header() {
    autosave = usePageAutosave({ pageId: "page", page: page(1), fresh: true, delayMs: 60_000,
      save, editorRef, onError: vi.fn() });
    [edited, setEdited] = useLocalPageMetadata(autosave);
    return createElement("h1", null, edited.title ?? listTitle);
  }
  root = createRoot(document.body.appendChild(document.createElement("div")));
  const render = () => root!.render(createElement(Header));
  await act(async () => render());
  return {
    get title() { return document.querySelector("h1")!.textContent; },
    get edited() { return edited; },
    async type(title: string) {
      await act(async () => { setEdited({ title }); autosave.schedule({ title }); });
    },
    async flush() { await act(async () => { void autosave.flush(); }); },
    async remote(title: string) { listTitle = title; await act(async () => render()); },
    async settle(task: Promise<unknown>) { await act(async () => { await task.catch(() => {}); }); },
  };
}

describe("local page title and icon overrides (MIN-704)", () => {
  it("keeps typed letters over older acknowledgements, then follows a later remote rename", async () => {
    const first = deferred<Page>();
    const second = deferred<Page>();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const h = await mount(save);

    await h.type("Draft");
    await h.flush();
    // Typed while the first PATCH is in flight: its response is older.
    await h.type("Draft title");
    first.resolve(page(2, "Draft"));
    await h.settle(first.promise);
    await h.remote("Draft");
    expect(h.title).toBe("Draft title");

    second.resolve(page(3, "Draft title"));
    await h.settle(second.promise);
    expect(h.edited).toEqual({});

    // Another client renames the page after the local save was confirmed.
    await h.remote("Renamed elsewhere");
    expect(h.title).toBe("Renamed elsewhere");
  });

  it("keeps the override while a failed save still holds the draft", async () => {
    const failed = deferred<Page>();
    const save = vi.fn().mockReturnValueOnce(failed.promise);
    const h = await mount(save);

    await h.type("Unsaved title");
    await h.flush();
    failed.reject(new Error("HTTP 500"));
    await h.settle(failed.promise);
    await h.remote("Renamed elsewhere");
    expect(h.title).toBe("Unsaved title");
  });
});

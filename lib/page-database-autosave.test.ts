// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  usePageAutosave,
  type PageAutosave,
} from "@/components/pages/use-page-autosave";
import { buildOptimisticPage } from "./optimistic-page";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.innerHTML = "";
});

async function mount(save: Parameters<typeof usePageAutosave>[0]["save"]) {
  let autosave!: PageAutosave;
  const page = buildOptimisticPage("project", { id: "entry" }, []);
  const onError = vi.fn();
  const editorRef = { current: null };
  function Harness() {
    autosave = usePageAutosave({
      pageId: "entry",
      page,
      fresh: true,
      delayMs: 60_000,
      save,
      editorRef,
      onError,
    });
    return null;
  }
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(createElement(Harness)));
  return {
    get autosave() {
      return autosave;
    },
    onError,
    page,
  };
}

describe("database entry navigation saves", () => {
  it("waits for an existing write and drains text typed while it was in flight", async () => {
    let resolve!: (page: ReturnType<typeof buildOptimisticPage>) => void;
    const save = vi.fn().mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const h = await mount(save);
    save.mockResolvedValue({ ...h.page, title: "Second title" });
    let first!: Promise<void>;
    let navigation!: Promise<boolean>;
    let navigated = false;
    await act(async () => {
      h.autosave.schedule({ title: "First title" });
      first = h.autosave.flush();
      h.autosave.schedule({ title: "Second title" });
      navigation = h.autosave.flushBeforeNavigation().then((saved) => {
        navigated = saved;
        return saved;
      });
    });
    expect(navigated).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ ...h.page, title: "First title" });
      await first;
      await navigation;
    });
    expect(navigated).toBe(true);
    expect(save).toHaveBeenLastCalledWith("entry", { title: "Second title" });
  });
  it("keeps the entry open and its draft available when saving fails", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Offline"));
    const h = await mount(save);
    let saved = true;
    await act(async () => {
      h.autosave.schedule({ title: "Unsaved title" });
      saved = await h.autosave.flushBeforeNavigation();
    });
    expect(saved).toBe(false);
    expect(h.onError).toHaveBeenCalled();
    save.mockResolvedValue({ ...h.page, title: "Unsaved title" });
    await act(async () => {
      saved = await h.autosave.flushBeforeNavigation();
    });
    expect(saved).toBe(true);
    expect(save).toHaveBeenLastCalledWith("entry", { title: "Unsaved title" });
  });
});

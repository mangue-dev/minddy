// @vitest-environment jsdom
import { Activity, act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Editor, JSONContent } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageEditor } from "@/components/pages/page-editor";
import { usePageAutosave, type PageAutosave } from "@/components/pages/use-page-autosave";
import { buildOptimisticPage } from "./optimistic-page";
import type { UpdatePageInput } from "./pages-api";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("mangue-ui", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));
vi.mock("@/components/pages/block-gutter", () => ({ BlockGutter: () => null }));
vi.mock("@/components/pages/page-comment-bubble", () => ({ PageCommentBubble: () => null }));
vi.mock("@/components/markdown-link-menu", () => ({ MarkdownLinkMenu: () => null }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  document.body.innerHTML = "";
});

describe("page editor tab retention", () => {
  it("keeps saved text in the next write after leaving and returning to a new page", async () => {
    const editorRef = { current: null as Editor | null };
    let serverPage = buildOptimisticPage("project", { id: "new-page" }, []);
    let autosave!: PageAutosave;
    const onError = vi.fn();
    const save = vi.fn(async (_id: string, input: UpdatePageInput) => {
      serverPage = { ...serverPage, ...input, version: serverPage.version + 1 };
      return serverPage;
    });
    function Surface() {
      const [page, setPage] = useState(serverPage);
      autosave = usePageAutosave({
        pageId: page.id, page, fresh: true, delayMs: 60_000,
        editorRef, onError,
        save: async (id, input) => {
          const saved = await save(id, input);
          setPage(saved);
          return saved;
        },
      });
      return createElement(PageEditor, {
        initialContent: page.content as JSONContent | null, editorRef,
        onChange: (content) => autosave.schedule({ content }),
      });
    }
    root = createRoot(document.body.appendChild(document.createElement("div")));
    const render = async (mode: "visible" | "hidden") => {
      await act(async () => root!.render(createElement(Activity, { mode, children: createElement(Surface) })));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    };
    await render("visible");
    const paragraphs = Array.from({ length: 100 }, (_, index) => ({
      type: "paragraph", content: [{ type: "text", text: `Paragraph ${index}: content that must never disappear.` }],
    }));
    await act(async () => { editorRef.current!.commands.setContent({ type: "doc", content: paragraphs }); });
    await act(async () => { expect(await autosave.flushBeforeNavigation()).toBe(true); });
    expect(autosave.state).toBe("saved");
    const savedDocument = serverPage.content;
    await render("hidden");
    await render("visible");
    expect(editorRef.current!.getJSON()).toEqual(savedDocument);
    await act(async () => { editorRef.current!.commands.insertContentAt(editorRef.current!.state.doc.content.size - 1, " Added after returning."); });
    await act(async () => { expect(await autosave.flushBeforeNavigation()).toBe(true); });
    expect(JSON.stringify(serverPage.content)).toContain("Paragraph 0");
    expect(JSON.stringify(serverPage.content)).toContain("Paragraph 99");
    expect(JSON.stringify(serverPage.content)).toContain("Added after returning");
    expect((serverPage.content as JSONContent).content?.slice(0, 99)).toEqual(
      (savedDocument as JSONContent).content?.slice(0, 99),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([true, false])("preserves the current document across repeated tab switches (emitUpdate=%s)", async (emitUpdate) => {
    const editorRef = { current: null as Editor | null };
    const onChange = vi.fn();
    const initialContent = { type: "doc", content: [] };
    root = createRoot(document.body.appendChild(document.createElement("div")));
    const render = async (mode: "visible" | "hidden") => {
      await act(async () => root!.render(createElement(Activity, { mode,
        children: createElement(PageEditor, { initialContent, onChange, editorRef }) })));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    };
    await render("visible");
    const first = editorRef.current!;
    await act(async () => {
      first.commands.setContent("<p>A long document that must survive switching tabs.</p>", { emitUpdate });
    });
    const expected = first.getJSON();
    onChange.mockClear();
    for (let switchCount = 0; switchCount < 3; switchCount++) {
      const beforeHide = editorRef.current!;
      await render("hidden");
      expect(beforeHide.isDestroyed).toBe(true);
      await render("visible");
      expect(editorRef.current!.getJSON()).toEqual(expected);
      expect(document.querySelector(".tiptap")?.textContent).toContain("A long document");
    }
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => { editorRef.current!.commands.insertContent(" More text."); });
    expect(onChange.mock.lastCall?.[0]).toEqual(editorRef.current!.getJSON());
    expect(editorRef.current!.getText()).toContain("A long document");
  });
});

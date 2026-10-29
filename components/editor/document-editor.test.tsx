// @vitest-environment jsdom
//
// The document and comment surfaces run on the page engine (MIN-728): the
// same schema minus the page-tree blocks, no block chrome, and a Markdown
// value that round-trips through the projection's serializer.
import { Activity, StrictMode, act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentEditor, type DocumentEditorApi } from "./document-editor";

const translate = vi.hoisted(() => (key: string) => key);
vi.mock("next-intl", () => ({ useTranslations: () => translate }));
vi.mock("@/components/pages/block-gutter", () => ({
  BlockGutter: () => createElement("div", { "data-testid": "gutter" }),
}));
vi.mock("@/components/pages/page-comment-bubble", () => ({ PageCommentBubble: () => null }));
vi.mock("@/components/markdown-link-menu", () => ({ MarkdownLinkMenu: () => null }));
vi.mock("@/lib/keyboard/use-send-mode", () => ({
  useIsSendShortcut: () => (event: KeyboardEvent) => event.metaKey || event.ctrlKey,
}));
// The comment field loads the editor lazily; tests mount it directly.
vi.mock("@/components/editor/document-editor-lazy", async () => {
  const real = await vi.importActual<typeof import("./document-editor")>("./document-editor");
  return { LazyDocumentEditor: real.DocumentEditor };
});

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

async function mount(props: Parameters<typeof DocumentEditor>[0]) {
  let api: DocumentEditorApi | null = null;
  await act(async () => {
    root.render(createElement(DocumentEditor, { ...props, apiRef: (next) => { api = next; } }));
    await settle();
  });
  return () => api!;
}

it("reads and writes Markdown with the page schema, without block chrome", async () => {
  const onChange = vi.fn();
  const api = await mount({
    value: "## Steps\n\n- [~] Reproduce\n- [ ] Fix\n\n> Note",
    onChange,
  });

  expect(api().getMarkdown()).toBe("## Steps\n\n- [~] Reproduce\n- [ ] Fix\n\n> Note");
  expect(host.querySelector("[data-testid=gutter]")).toBeNull();
  expect(host.querySelector("[data-gutter]")).toBeNull();
  // Opening a document is not an edit.
  expect(onChange).not.toHaveBeenCalled();

  await act(async () => {
    api().editor()!.commands.insertContentAt(api().editor()!.state.doc.content.size, "\n\nDone");
    await settle();
  });
  expect(onChange).toHaveBeenLastCalledWith(
    expect.stringContaining("Done"),
    expect.objectContaining({ type: "doc" })
  );
});

it("keeps the page-tree blocks out of a document", async () => {
  const api = await mount({ value: "Intro" });
  const schema = api().editor()!.schema;
  expect(schema.nodes.subpage).toBeUndefined();
  expect(schema.nodes.callout).toBeDefined();
  expect(schema.nodes.image).toBeDefined();
});

it("submits on the send shortcut and leaves plain Enter to the editor", async () => {
  const onSubmit = vi.fn();
  const api = await mount({ value: "", onSubmit });
  const dom = api().editor()!.view.dom;

  dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(onSubmit).not.toHaveBeenCalled();
  dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
  expect(onSubmit).toHaveBeenCalledOnce();
});

it("sends on ⌘Enter without a line break, and breaks the line on ⇧Enter", async () => {
  const onSubmit = vi.fn();
  const api = await mount({ value: "Hello", onSubmit });
  const editor = api().editor()!;
  const dom = editor.view.dom;
  editor.commands.focus("end");

  dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true, cancelable: true }));
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(editor.getJSON().content?.[0]?.content).toEqual([{ type: "text", text: "Hello" }]);

  dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true }));
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(editor.getJSON().content?.[0]?.content?.at(-1)).toEqual({ type: "hardBreak" });
});

it("lets a comment draft be cleared from outside after sending", async () => {
  const { CommentEditor } = await import("./comment-editor");
  let setDraft!: (value: string) => void;
  let latest = "";
  function Composer() {
    const [draft, set] = useState("");
    setDraft = set;
    latest = draft;
    return createElement(CommentEditor, { value: draft, onChange: set });
  }
  await act(async () => {
    root.render(createElement(Composer));
    await settle();
  });

  const field = host.querySelector<HTMLElement>(".ProseMirror")!;
  expect(field).not.toBeNull();
  await act(async () => {
    setDraft("Ping @Numo about this");
    await settle();
  });
  // The written “@Numo” is rebuilt into the same pill the comment will show.
  // (the pill shows the name without the at sign).
  expect(field.textContent).toBe("Ping Numo about this");

  await act(async () => {
    setDraft("");
    await settle();
  });
  expect(field.textContent).toBe("");
  expect(latest).toBe("");
});

it("survives React's double mount, which hands over a destroyed editor first", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  let api: DocumentEditorApi | null = null;
  try {
    await act(async () => {
      root.render(createElement(StrictMode, null,
        createElement(DocumentEditor, { value: "## Title\n\nBody", apiRef: (next) => { api = next; } })));
      await settle();
    });
    expect(api!.getMarkdown()).toBe("## Title\n\nBody");
    expect(api!.editor()?.isDestroyed).toBe(false);
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/getMarkdown|view is not available/);
  } finally {
    errors.mockRestore();
  }
});

it("survives a retained tab hidden and shown again", async () => {
  // Activity runs effect cleanups when it hides a tab — tiptap destroys the
  // editor — and re-runs effects with the old instance still in state when
  // it shows the tab again, before the new editor is handed over.
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  let api: DocumentEditorApi | null = null;
  const render = (mode: "visible" | "hidden") => act(async () => {
    root.render(createElement(Activity, {
      mode,
      children: createElement(DocumentEditor, { value: "Retained text", apiRef: (next) => { api = next; } }),
    }));
    await settle();
  });
  try {
    await render("visible");
    await render("hidden");
    await render("visible");
    expect(api!.getMarkdown()).toBe("Retained text");
    expect(api!.editor()?.isDestroyed).toBe(false);
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/getMarkdown|view is not available/);
  } finally {
    errors.mockRestore();
  }
});

it("reports and keeps a blank line left between two paragraphs (MIN-745)", async () => {
  const onChange = vi.fn();
  const api = await mount({ value: "First\n\nSecond", onChange });
  const editor = api().editor()!;

  // Enter at the end of “First”: an empty paragraph between the two.
  await act(async () => {
    editor.chain().setTextSelection(1 + "First".length).splitBlock().run();
    await settle();
  });
  // The change is reported, so the surfaces that save on a Markdown
  // difference save it, and the Markdown reads back the same document.
  expect(onChange).toHaveBeenLastCalledWith("First\n\n \n\nSecond", expect.anything());

  const reopened = await mount({ value: api().getMarkdown() });
  expect(reopened().editor()!.getJSON().content?.map((node) => node.content?.length ?? 0))
    .toEqual([1, 0, 1]);
});

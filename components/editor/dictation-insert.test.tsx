// @vitest-environment jsdom
//
// MIN-984: a dictation from the phone toolbar is Markdown, written where the
// caret was when the take started.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentEditor, type DocumentEditorApi } from "./document-editor";
import { insertDictatedMarkdown } from "./dictation-insert";

const translate = vi.hoisted(() => (key: string) => key);
vi.mock("next-intl", () => ({ useTranslations: () => translate, useLocale: () => "en" }));
vi.mock("@/components/pages/block-gutter", () => ({ BlockGutter: () => null }));
vi.mock("@/components/pages/page-comment-bubble", () => ({ PageCommentBubble: () => null }));
vi.mock("@/components/markdown-link-menu", () => ({ MarkdownLinkMenu: () => null }));
vi.mock("@/lib/keyboard/use-send-mode", () => ({
  useIsSendShortcut: () => (event: KeyboardEvent) => event.metaKey || event.ctrlKey,
}));

let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.body.appendChild(document.createElement("div")));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function mount(value: string) {
  let api: DocumentEditorApi | null = null;
  await act(async () => {
    root.render(createElement(DocumentEditor, { value, apiRef: (next) => { api = next; } }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return api!;
}

it("turns a dictated checklist into blocks in place of the empty line", async () => {
  const api = await mount("Intro\n\n");
  const editor = api.editor()!;
  const end = editor.state.doc.content.size - 1;
  act(() => {
    insertDictatedMarkdown(editor, end, "## Next steps\n\n- [ ] Call the bank\n- [ ] Send the **draft**");
  });
  expect(api.getMarkdown()).toBe("Intro\n\n## Next steps\n\n- [ ] Call the bank\n- [ ] Send the **draft**");
});

it("continues a sentence with a space and keeps inline Markdown", async () => {
  const api = await mount("Fix the");
  const editor = api.editor()!;
  act(() => {
    insertDictatedMarkdown(editor, editor.state.doc.content.size - 1, "`login` redirect.");
  });
  expect(api.getMarkdown()).toBe("Fix the `login` redirect.");
});

it("writes at the remembered caret, not at the end", async () => {
  const api = await mount("First\n\nLast");
  const editor = api.editor()!;
  // Right after “First”.
  act(() => {
    insertDictatedMarkdown(editor, 6, "and second");
  });
  expect(api.getMarkdown()).toBe("First and second\n\nLast");
});

it("ignores an empty take", async () => {
  const api = await mount("Keep");
  expect(insertDictatedMarkdown(api.editor()!, 1, "  \n ")).toBe(false);
  expect(api.getMarkdown()).toBe("Keep");
});

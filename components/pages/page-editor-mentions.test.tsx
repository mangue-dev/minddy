// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Editor } from "@tiptap/react";
import { afterEach, expect, it, vi } from "vitest";
import type { MentionOption } from "@/components/mention-suggest";
import { PageEditor, type PageEditorMentions } from "./page-editor";

// One translator, as next-intl returns for a stable locale: the extensions memo
// depends on it through the slash menu and placeholder labels.
const translate = vi.hoisted(() => (key: string) => key);
vi.mock("next-intl", () => ({ useTranslations: () => translate }));
vi.mock("@/components/pages/block-gutter", () => ({ BlockGutter: () => null }));
vi.mock("@/components/pages/page-comment-bubble", () => ({ PageCommentBubble: () => null }));
vi.mock("@/components/markdown-link-menu", () => ({ MarkdownLinkMenu: () => null }));

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

const option = (id: string): MentionOption => ({ type: "page", id, label: `Page ${id}` });
const mentionsWith = (items: MentionOption[], onQuery = vi.fn()): PageEditorMentions => ({
  items: () => items,
  onQuery,
  scan: (value) => [{ text: value }],
});

it("keeps the editor extensions and suggests from the latest mention catalog", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const editorRef = { current: null as Editor | null };
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  const render = (mentions: PageEditorMentions) => act(async () => {
    root.render(createElement(PageEditor, { initialContent: null, onChange: () => {}, editorRef, mentions }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  await render(mentionsWith([option("first")]));
  const editor = editorRef.current!;
  const extensions = editor.options.extensions;
  const latestQuery = vi.fn();
  await render(mentionsWith([option("first"), option("second")], latestQuery));

  expect(editorRef.current).toBe(editor);
  expect(editor.options.extensions).toBe(extensions);
  const suggest = editor.extensionManager.extensions.find((extension) => extension.name === "mentionSuggest")!;
  const options = suggest.options as { items: () => MentionOption[]; onQuery?: () => void };
  expect(options.items().map((item) => item.id)).toEqual(["first", "second"]);
  options.onQuery?.();
  expect(latestQuery).toHaveBeenCalledOnce();

  await act(async () => root.unmount());
});

// @vitest-environment jsdom
//
// Mention pills inside a selection are marked, so they are painted as
// selected like the text around them (MIN-734).
import { afterEach, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { AllSelection, TextSelection } from "@tiptap/pm/state";
import type { DecorationSet } from "@tiptap/pm/view";
import { pageExtensions } from "@/components/pages/page-extensions";
import { MentionNode } from "@/components/markdown-mention";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function marked(): number {
  let count = 0;
  editor!.view.someProp("decorations", (decorations) => {
    const set = decorations(editor!.state) as DecorationSet | null;
    count += set?.find().length ?? 0;
  });
  return count;
}

it("marks the pills a selection covers, and only those", () => {
  editor = new Editor({
    content: "Ask [@Jean](mention:member/5ad9b962-93e7-4a7c-a44b-f4925484ba93) and [@MIN-42](mention:issue/9f1c2a3b-0000-4000-8000-000000000001)",
    extensions: pageExtensions({ headless: true, blocks: "document", mention: MentionNode }),
  });
  expect(marked()).toBe(0);
  editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)));
  expect(marked()).toBe(2);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 6)));
  expect(marked()).toBe(1);
});

it("copies a typed pill with the label it showed, never the stored one", async () => {
  const { rememberShownMention, resetMentionResolution } = await import("@/lib/mention-resolution");
  resetMentionResolution();
  const page = "9f1c2a3b-0000-4000-8000-000000000002";
  rememberShownMention("page", page, null);
  editor = new Editor({
    element: document.createElement("div"),
    content: `See [@Secret roadmap](mention:page/${page}) now`,
    extensions: pageExtensions({ headless: true, blocks: "document", mention: MentionNode }),
  });
  editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)));
  const { dom, slice } = editor.view.serializeForClipboard(editor.state.selection.content());
  expect(dom.innerHTML).not.toContain("Secret");
  // The app's editors write the copied text as Markdown, from this same slice.
  const markdown = (editor.storage as unknown as {
    markdown: { serializer: { serialize(content: unknown): string } };
  }).markdown.serializer.serialize(slice.content);
  expect(markdown).not.toContain("Secret");
  expect(markdown).toContain(`[@unavailable](mention:page/${page})`);
});

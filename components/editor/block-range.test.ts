// @vitest-environment jsdom
//
// ⌘A / Ctrl+A selects the text the way ProseMirror draws it (MIN-728): the
// block-range select-all of NodeRange was invisible.
import { afterEach, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { AllSelection } from "@tiptap/pm/state";
import { pageExtensions } from "@/components/pages/page-extensions";
import { BlockRange } from "./block-range";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.innerHTML = "";
});

it("selects all the text with Mod-a, not a block range", () => {
  const element = document.body.appendChild(document.createElement("div"));
  editor = new Editor({
    element,
    content: "<p>First</p><p>Second</p>",
    extensions: [...pageExtensions({ headless: true, blocks: "document" }), BlockRange],
  });
  editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true }));
  expect(editor.state.selection).toBeInstanceOf(AllSelection);
  expect(editor.view.dom.classList.contains("ProseMirror-noderangeselection")).toBe(false);
});

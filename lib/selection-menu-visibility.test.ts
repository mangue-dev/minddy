// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { pageExtensions } from "@/components/pages/page-extensions";
import { BlockSelection } from "@/components/editor/block-selection";
import { shouldShowSelectionMenu } from "@/components/pages/page-comment-bubble";
import { turnIntoItems } from "@/components/pages/blocks";
import { turnBlocksInto } from "@/components/pages/block-actions";
import { isBlockSelection } from "@/components/editor/block-selection";

let editor: Editor;

async function make(content: string, focused = true) {
  editor = new Editor({ extensions: pageExtensions({ headless: true }) as never, content });
  editor.view.hasFocus = () => focused;
  // The editor reports itself initialized a tick after its creation.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return editor;
}

afterEach(() => editor?.destroy());

describe("the selection card's visibility", () => {
  it("shows for a text selection and for selected blocks", async () => {
    await make("<p>one</p><p>two</p>");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 4)));
    expect(shouldShowSelectionMenu({ editor })).toBe(true);

    const second = editor.state.doc.child(0).nodeSize;
    editor.view.dispatch(editor.state.tr.setSelection(BlockSelection.create(editor.state.doc, 0, second)));
    expect(shouldShowSelectionMenu({ editor })).toBe(true);
  });

  it("stays hidden for a caret, a node selection, or an unfocused editor", async () => {
    await make("<p>one</p><hr><p>two</p>");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)));
    expect(shouldShowSelectionMenu({ editor })).toBe(false);

    const rule = editor.state.doc.child(0).nodeSize;
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, rule)));
    expect(shouldShowSelectionMenu({ editor })).toBe(false);

    editor.destroy();
    await make("<p>one</p>", false);
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 4)));
    expect(shouldShowSelectionMenu({ editor })).toBe(false);
  });

  it("keeps selected blocks selected as blocks once turned into another type", async () => {
    await make("<p>one</p><p>two</p><p>three</p>");
    const second = editor.state.doc.child(0).nodeSize;
    editor.view.dispatch(editor.state.tr.setSelection(BlockSelection.create(editor.state.doc, 0, second)));
    const heading = turnIntoItems(editor).find(({ block }) => block.nodeName === "heading")!.block;

    expect(turnBlocksInto(editor, heading)).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe("heading");
    expect(editor.state.doc.child(1).type.name).toBe("heading");
    expect(editor.state.doc.child(2).type.name).toBe("paragraph");
    expect(isBlockSelection(editor.state.selection)).toBe(true);
    expect(editor.state.selection.content().content.childCount).toBe(2);
  });
});

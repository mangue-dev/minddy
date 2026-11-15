// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { pageExtensions } from "@/components/pages/page-extensions";
import { BlockSelection } from "@/components/editor/block-selection";
import {
  selectionMenuReference,
  shouldShowSelectionMenu,
  turnIntoPosition,
} from "@/components/pages/page-comment-bubble";
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
  it("shows for a text selection and for one selected block, not for several", async () => {
    await make("<p>one</p><p>two</p>");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 4)));
    expect(shouldShowSelectionMenu({ editor })).toBe(true);

    editor.view.dispatch(editor.state.tr.setSelection(BlockSelection.create(editor.state.doc, 0, 0)));
    expect(shouldShowSelectionMenu({ editor })).toBe(true);

    const second = editor.state.doc.child(0).nodeSize;
    editor.view.dispatch(editor.state.tr.setSelection(BlockSelection.create(editor.state.doc, 0, second)));
    expect(shouldShowSelectionMenu({ editor })).toBe(false);
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

describe("the selection card's geometry", () => {
  const viewport = { width: 1280, height: 800 };
  const menu = { width: 224, height: 288 };
  const box = (top: number, left: number, height: number, width: number) =>
    ({ top, left, bottom: top + height, right: left + width });

  it("carries the card's gap in its reference, above and below the passage", () => {
    const reference = selectionMenuReference(new DOMRect(100, 200, 50, 20), 8);
    expect([reference.left, reference.top, reference.width, reference.height]).toEqual([100, 192, 50, 36]);
  });

  it("opens the block types to the right of the card, level with its row", () => {
    const card = box(100, 400, 200, 200);
    expect(turnIntoPosition({ card, row: box(108, 408, 32, 184), menu, viewport }))
      .toEqual({ top: 100, left: 604 });
  });

  it("opens them to the left when the right has no room", () => {
    const card = box(100, 1000, 200, 200);
    expect(turnIntoPosition({ card, row: box(108, 1008, 32, 184), menu, viewport }).left).toBe(1000 - 4 - 224);
  });

  it("keeps them inside the window near its bottom and its sides", () => {
    // The row 100 px above the bottom: the submenu rises to fit.
    const low = turnIntoPosition({ card: box(500, 400, 200, 200), row: box(700, 408, 32, 184), menu, viewport });
    expect(low.top).toBe(800 - 10 - 288);
    // No room on either side of a card as wide as a narrow window.
    const narrow = turnIntoPosition({
      card: box(100, 20, 200, 300),
      row: box(108, 28, 32, 284),
      menu,
      viewport: { width: 340, height: 800 },
    });
    expect(narrow.left).toBe(340 - 10 - 224);
    expect(narrow.left).toBeGreaterThanOrEqual(10);
  });
});

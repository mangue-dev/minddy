// @vitest-environment jsdom
//
// What the editor paints for page comments (MIN-282, MIN-1002): which block
// and which passages are marked while a thread is open or a comment is being
// written, and what a click in a commented passage does.

import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";

import { pageExtensions } from "@/components/pages/page-extensions";
import {
  BlockComments,
  openPassages,
  setCommentedBlocks,
  type BlockCommentsStorage,
  type CommentedBlocks,
} from "@/components/pages/block-comments";
import { PAGE_BLOCK_ID_ATTRIBUTE } from "@/lib/pages-mentions";

vi.mock("@/components/editor/widget-root", () => ({ mountWidgetRoot: () => () => {} }));

const editors: Editor[] = [];

function pageEditor() {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: [...pageExtensions({ headless: true }), BlockComments] as never,
    content:
      '<p data-blockid="block-a">We ship the public beta in March.</p><p data-blockid="block-b">Pricing follows by email.</p>',
  });
  editors.push(editor);
  const ids: string[] = [];
  editor.state.doc.forEach((node) => ids.push(node.attrs[PAGE_BLOCK_ID_ATTRIBUTE] as string));
  const blocks = () => [...editor.view.dom.children] as HTMLElement[];
  return { editor, ids, blocks };
}

const commented = (id: string, quote: string): CommentedBlocks =>
  new Map([[id, { count: 1, quotes: [quote], whole: false }]]);

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.view.dom.parentElement?.remove();
    editor.destroy();
  }
});

describe("page comment decorations", () => {
  it("marks the block of the open thread and anchors on its passages", () => {
    const { editor, ids, blocks } = pageEditor();
    setCommentedBlocks(editor, commented(ids[0], "the public beta"));
    expect(blocks()[0].classList.contains("page-block-comment-open")).toBe(false);

    setCommentedBlocks(editor, commented(ids[0], "the public beta"), { blockId: ids[0] });
    const [first, second] = blocks();
    expect(first.classList.contains("page-block-commented")).toBe(true);
    expect(first.classList.contains("page-block-comment-open")).toBe(true);
    expect(second.className).toBe("");
    expect(openPassages(first).map((passage) => passage.textContent)).toEqual(["the public beta"]);
  });

  it("tints the passage of a comment being written, on a block without a thread", () => {
    const { editor, ids, blocks } = pageEditor();
    setCommentedBlocks(editor, new Map(), { blockId: ids[1], quote: "by email" });
    const second = blocks()[1];
    expect(second.classList.contains("page-block-commented")).toBe(false);
    expect(second.classList.contains("page-block-comment-open")).toBe(true);
    expect(openPassages(second).map((passage) => passage.textContent)).toEqual(["by email"]);
    // No thread yet: nothing to count, so no badge.
    expect(second.querySelector(".page-block-comment-host")).toBeNull();
  });

  it("anchors a new comment on its own passage when the block already has threads", () => {
    const { editor, ids, blocks } = pageEditor();
    setCommentedBlocks(editor, commented(ids[0], "the public beta"), { blockId: ids[0], quote: "in March" });
    const first = blocks()[0];
    expect([...first.querySelectorAll(".page-commented-passage")].map((passage) => passage.textContent)).toEqual([
      "the public beta",
      "in March",
    ]);
    expect(openPassages(first).map((passage) => passage.textContent)).toEqual(["in March"]);
  });

  it("clears the open state when the thread closes", () => {
    const { editor, ids, blocks } = pageEditor();
    setCommentedBlocks(editor, new Map(), { blockId: ids[1], quote: "by email" });
    setCommentedBlocks(editor, new Map(), null);
    expect(blocks()[1].className).toBe("");
    expect(blocks()[1].querySelector(".page-commented-passage")).toBeNull();
  });
});

describe("a click in a commented passage", () => {
  function click(editor: Editor, target: Element, pos: number, init: MouseEventInit = {}) {
    const event = new MouseEvent("click", { button: 0, bubbles: true, ...init });
    Object.defineProperty(event, "target", { value: target });
    let handled = false;
    editor.view.someProp("handleClick", (handler) => {
      handled = handler(editor.view, pos, event) || handled;
    });
    return handled;
  }

  function withThread() {
    const page = pageEditor();
    setCommentedBlocks(page.editor, commented(page.ids[0], "the public beta"));
    const storage = (page.editor.storage as unknown as { blockComments: BlockCommentsStorage }).blockComments;
    const open = vi.fn();
    storage.open = open;
    const passage = page.blocks()[0].querySelector(".page-commented-passage")!;
    return { ...page, open, passage };
  }

  it("opens the thread, puts the caret at the click and lets the editor handle the click", () => {
    const { editor, ids, open, passage } = withThread();
    expect(click(editor, passage, 12)).toBe(false);
    expect(open).toHaveBeenCalledWith(ids[0], "passage");
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(12);
  });

  it("leaves a click outside a passage, or one that extends a selection, alone", () => {
    const { editor, blocks, open, passage } = withThread();
    click(editor, blocks()[1], 40);
    click(editor, passage, 12, { shiftKey: true });
    expect(open).not.toHaveBeenCalled();
  });
});

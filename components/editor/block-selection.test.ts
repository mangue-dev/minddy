// @vitest-environment jsdom
//
// Block selection, the Notion way (block-selection.ts): what a drag, ⇧-arrows
// and Esc select, what the keys do to selected blocks, the paint every
// selection shows, and that none of it reaches the document or its Markdown.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { AllSelection, NodeSelection, TextSelection, type Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { pageExtensions } from "@/components/pages/page-extensions";
import { blockClipboard, selectBlockAt, selectBlockFromHandle } from "@/components/pages/block-actions";
import {
  BLOCK_SELECTED_CLASS,
  BLOCK_SELECTION_ROOT_CLASS,
  BlockSelection,
  BlockSelectionExtension,
  INLINE_SELECTED_CLASS,
  blockSelectionForDrag,
} from "./block-selection";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.innerHTML = "";
});

function mount(content: string, options: { selectOnEscape?: boolean } = {}): Editor {
  const element = document.body.appendChild(document.createElement("div"));
  editor = new Editor({
    element,
    content,
    extensions: [
      ...pageExtensions({ headless: true, blocks: "page" }),
      BlockSelectionExtension.configure({ selectOnEscape: options.selectOnEscape ?? true }),
    ],
  });
  return editor;
}

/** The start of the `index`-th node named `name`. */
function posOf(target: Editor, name: string, index = 0): number {
  const found: number[] = [];
  target.state.doc.descendants((node, pos) => {
    if (node.type.name === name) found.push(pos);
  });
  const pos = found[index];
  if (pos === undefined) throw new Error(`no ${name} #${index}`);
  return pos;
}

function textSelect(target: Editor, anchor: number, head: number) {
  target.view.dispatch(target.state.tr.setSelection(TextSelection.create(target.state.doc, anchor, head)));
}

function key(target: Editor, init: KeyboardEventInit) {
  target.view.dom.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
}

function selectionPlugin(target: Editor): Plugin {
  const plugin = target.state.plugins.find((candidate) =>
    (candidate as unknown as { key: string }).key.startsWith("blockSelection$"));
  if (!plugin) throw new Error("block selection plugin not mounted");
  return plugin;
}

/** A mouse drag as the plugin sees it: the press, the selection the browser
    extends while the button is down, the release. */
function drag(target: Editor, anchor: number, head: number, pressOn?: Element, clientX = 0) {
  const press = new MouseEvent("mousedown", { button: 0, bubbles: true, clientX });
  Object.defineProperty(press, "target", { value: pressOn ?? target.view.dom.firstElementChild });
  const handlers = selectionPlugin(target).props.handleDOMEvents as {
    mousedown: (view: EditorView, event: MouseEvent) => boolean;
  };
  handlers.mousedown(target.view, press);
  textSelect(target, anchor, head);
  const during = target.view.dom.querySelectorAll(`.${BLOCK_SELECTED_CLASS}`).length;
  // The release is read on the next task, once ProseMirror has seen it.
  vi.useFakeTimers();
  try {
    document.dispatchEvent(new MouseEvent("mouseup", { button: 0 }));
    vi.runAllTimers();
  } finally {
    vi.useRealTimers();
  }
  return { during };
}

const LIST = "<p>Intro</p><ul><li><p>One</p></li><li><p>Two</p></li></ul><p>Outro</p>";

describe("mouse", () => {
  it("keeps a drag inside one block a text selection", () => {
    const e = mount("<p>Hello world</p><p>Second</p>");
    const { during } = drag(e, 2, 7);
    expect(during).toBe(0);
    expect(e.state.selection).toBeInstanceOf(TextSelection);
    expect(e.view.dom.classList.contains(BLOCK_SELECTION_ROOT_CLASS)).toBe(false);
  });

  it("dispatches nothing when a click or a drag ends in one block", () => {
    // A transaction from the release would write the selection of before the
    // click back into the page and lose where the click put the caret.
    const e = mount("<p>Hello world</p><p>Second</p>");
    const transactions = vi.fn();
    e.on("transaction", transactions);
    drag(e, 2, 7);
    expect(transactions).toHaveBeenCalledTimes(1);
  });

  it("turns a drag reaching another block into a selection of both blocks", () => {
    const e = mount("<p>Hello world</p><p>Second</p><p>Third</p>");
    const second = posOf(e, "paragraph", 1);
    const { during } = drag(e, 3, second + 3);
    // Painted as blocks while the button is still down.
    expect(during).toBe(2);
    const selection = e.state.selection;
    expect(selection).toBeInstanceOf(BlockSelection);
    expect(selection.ranges.map((range) => range.$from.pos)).toEqual([0, second]);
    expect(e.view.dom.querySelectorAll(`.${BLOCK_SELECTED_CLASS}`)).toHaveLength(2);
    expect(e.view.dom.classList.contains(BLOCK_SELECTION_ROOT_CLASS)).toBe(true);
  });

  it("selects list items, not the whole list, for a drag between two items", () => {
    const e = mount(LIST);
    drag(e, posOf(e, "paragraph", 1) + 2, posOf(e, "paragraph", 2) + 2);
    const selection = e.state.selection as BlockSelection;
    expect(selection).toBeInstanceOf(BlockSelection);
    expect(selection.ranges.map((range) => range.$from.nodeAfter?.type.name)).toEqual(["listItem", "listItem"]);
  });

  it("selects the whole list once a drag leaves it", () => {
    const e = mount(LIST);
    drag(e, posOf(e, "paragraph", 1) + 2, posOf(e, "paragraph", 3) + 2);
    const names = e.state.selection.ranges.map((range) => range.$from.nodeAfter?.type.name);
    expect(names).toEqual(["bulletList", "paragraph"]);
  });

  it("selects blocks when the pointer reaches an atom the text selection cannot enter", () => {
    const e = mount("<p>Before</p><hr><p>After</p>");
    textSelect(e, 2, 4);
    const rule = posOf(e, "horizontalRule");
    const blocks = blockSelectionForDrag(e.state.doc, e.state.selection, { fromMargin: false, pointer: rule });
    expect(blocks?.ranges.map((range) => range.$from.nodeAfter?.type.name)).toEqual(["paragraph", "horizontalRule"]);
    // Back over the block it started in, the text selection is text again.
    expect(blockSelectionForDrag(e.state.doc, e.state.selection, { fromMargin: false, pointer: 0 })).toBeNull();
  });

  it("selects the block under a drag that starts in the margin beside the text", () => {
    const e = mount("<p>Hello world</p><p>Second</p>");
    // jsdom lays nothing out: the editor box is at x = 0, so x = -10 is beside it.
    drag(e, 2, 7, e.view.dom, -10);
    expect(e.state.selection).toBeInstanceOf(BlockSelection);
    expect(e.state.selection.ranges).toHaveLength(1);
  });

  it("keeps a drag from the gap between two blocks a text selection", () => {
    const e = mount("<p>Hello world</p><p>Second</p>");
    drag(e, 2, 7, e.view.dom, 0);
    expect(e.state.selection).toBeInstanceOf(TextSelection);
  });

  it("extends a block selection with a ⇧-click on the block handle", () => {
    const e = mount("<p>A</p><p>B</p><p>C</p>");
    selectBlockAt(e, 0);
    expect(e.state.selection).toBeInstanceOf(BlockSelection);
    selectBlockFromHandle(e, posOf(e, "paragraph", 2), true);
    expect(e.state.selection.ranges).toHaveLength(3);
  });
});

describe("keyboard", () => {
  it("selects the block with Esc, and clears it with Esc again", () => {
    const e = mount("<p>Hello</p><p>World</p>");
    textSelect(e, 3, 3);
    key(e, { key: "Escape" });
    const selection = e.state.selection;
    expect(selection).toBeInstanceOf(BlockSelection);
    expect([selection.from, selection.to]).toEqual([0, 7]);
    key(e, { key: "Escape" });
    expect(e.state.selection).toBeInstanceOf(TextSelection);
    expect(e.state.selection.empty).toBe(true);
  });

  it("selects the list item around the caret, not its paragraph alone", () => {
    const e = mount(LIST);
    textSelect(e, posOf(e, "paragraph", 2) + 2, posOf(e, "paragraph", 2) + 2);
    key(e, { key: "Escape" });
    expect(e.state.selection.ranges.map((range) => range.$from.nodeAfter?.type.name)).toEqual(["listItem"]);
  });

  it("leaves Esc to a surface that turned it off, and still clears blocks there", () => {
    const e = mount("<p>Hello</p><p>World</p>", { selectOnEscape: false });
    textSelect(e, 3, 3);
    key(e, { key: "Escape" });
    expect(e.state.selection).toBeInstanceOf(TextSelection);
    selectBlockAt(e, 0);
    key(e, { key: "Escape" });
    expect(e.state.selection).toBeInstanceOf(TextSelection);
  });

  it("moves the selection with the arrows and extends it with ⇧-arrows", () => {
    const e = mount(LIST);
    selectBlockAt(e, 0);
    key(e, { key: "ArrowDown" });
    expect(e.state.selection.ranges.map((range) => range.$from.nodeAfter?.textContent)).toEqual(["One"]);
    key(e, { key: "ArrowDown", shiftKey: true });
    expect(e.state.selection.ranges.map((range) => range.$from.nodeAfter?.textContent)).toEqual(["One", "Two"]);
    key(e, { key: "ArrowDown", shiftKey: true });
    expect(e.state.selection.ranges.map((range) => range.$from.nodeAfter?.type.name)).toEqual(["bulletList", "paragraph"]);
    // Shrinking comes back to the item it started from.
    key(e, { key: "ArrowUp", shiftKey: true });
    key(e, { key: "ArrowUp", shiftKey: true });
    expect(e.state.selection.ranges.map((range) => range.$from.nodeAfter?.textContent)).toEqual(["One"]);
  });

  it("turns ⇧-↓ at the end of a block into a block selection, and leaves it to text before", () => {
    const e = mount("<p>Hello</p><p>World</p>");
    let atEdge = false;
    e.view.endOfTextblock = () => atEdge;
    textSelect(e, 2, 4);
    key(e, { key: "ArrowDown", shiftKey: true });
    expect(e.state.selection).toBeInstanceOf(TextSelection);
    atEdge = true;
    key(e, { key: "ArrowDown", shiftKey: true });
    expect(e.state.selection).toBeInstanceOf(BlockSelection);
    expect(e.state.selection.ranges).toHaveLength(2);
  });

  it("deletes the selected blocks whole with ⌫, and undo brings them and the selection back", () => {
    const e = mount(LIST);
    drag(e, posOf(e, "paragraph", 1) + 2, posOf(e, "paragraph", 2) + 2);
    key(e, { key: "Backspace" });
    expect(e.state.doc.textContent).toBe("IntroOutro");
    expect(e.state.doc.childCount).toBe(2);
    expect(e.state.selection).toBeInstanceOf(TextSelection);
    e.commands.undo();
    expect(e.state.doc.textContent).toBe("IntroOneTwoOutro");
    expect(e.state.selection).toBeInstanceOf(BlockSelection);
  });

  it("puts the caret at the end of a single selected block on Enter", () => {
    const e = mount("<p>Hello</p><p>World</p>");
    selectBlockAt(e, 0);
    key(e, { key: "Enter" });
    expect(e.state.selection).toBeInstanceOf(TextSelection);
    expect(e.state.selection.head).toBe(6);
    expect(e.getHTML()).toBe("<p>Hello</p><p>World</p>");
  });

  it("ignores typing over selected blocks", () => {
    const e = mount("<p>Hello</p><p>World</p>");
    selectBlockAt(e, 0);
    const typed = new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true });
    e.view.dom.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(true);
    const handled = e.view.someProp("handleTextInput", (handler) => handler(e.view, 1, 1, "x", () => e.state.tr));
    expect(handled).toBe(true);
    expect(e.getHTML()).toBe("<p>Hello</p><p>World</p>");
  });

  it("selects the block's text with ⌘A, then every block, also from a code block", () => {
    const e = mount("<p>First</p><pre><code>const a = 1</code></pre><ul><li><p>Item</p></li></ul>");
    const code = posOf(e, "codeBlock");
    textSelect(e, code + 3, code + 3);
    key(e, { key: "a", ctrlKey: true });
    expect(e.state.selection).toBeInstanceOf(TextSelection);
    expect(e.state.doc.textBetween(e.state.selection.from, e.state.selection.to)).toBe("const a = 1");
    key(e, { key: "a", ctrlKey: true });
    const all = e.state.selection;
    expect(all).toBeInstanceOf(BlockSelection);
    expect(all.ranges.map((range) => range.$from.nodeAfter?.type.name))
      .toEqual(e.state.doc.content.content.map((node) => node.type.name));
    expect(e.view.dom.querySelectorAll(`.${BLOCK_SELECTED_CLASS}`)).toHaveLength(e.state.doc.childCount);
    // Like any block selection: typing is ignored, and ⌫ deletes every block.
    const typed = new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true });
    e.view.dom.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(true);
    key(e, { key: "Backspace" });
    expect(e.state.doc.textContent).toBe("");
  });

  it("selects every block at once with ⌘A in an empty block", () => {
    const e = mount("<p>First</p><p></p>");
    textSelect(e, posOf(e, "paragraph", 1) + 1, posOf(e, "paragraph", 1) + 1);
    key(e, { key: "a", ctrlKey: true });
    expect(e.state.selection).toBeInstanceOf(BlockSelection);
  });
});

describe("clipboard", () => {
  it("copies and cuts whole blocks", () => {
    const e = mount("<p>Hello</p><p>World</p><p>Rest</p>");
    drag(e, 2, posOf(e, "paragraph", 1) + 2);
    const copied = blockClipboard(e);
    expect(copied?.text).toContain("Hello");
    expect(copied?.text).toContain("World");
    const slice = e.state.selection.content();
    expect(slice.content.childCount).toBe(2);
    // A cut deletes the selection the way ProseMirror's cut handler does.
    e.view.dispatch(e.state.tr.deleteSelection());
    expect(e.getHTML()).toBe("<p>Rest</p>");
  });
});

describe("paint", () => {
  it("marks atoms and whole inline-code runs a text selection covers", () => {
    const e = mount('<p>Use <code>npm test</code> and <span data-type="inline-math" data-latex="x^2"></span> here</p>');
    textSelect(e, 1, e.state.doc.content.size - 1);
    expect(e.view.dom.querySelectorAll(`.${INLINE_SELECTED_CLASS}`)).toHaveLength(2);
    expect(e.view.dom.querySelector(`code .${INLINE_SELECTED_CLASS}`)?.textContent).toBe("npm test");
    // Part of an inline code is text: the native highlight marks it.
    textSelect(e, 6, 8);
    expect(e.view.dom.querySelectorAll(`.${INLINE_SELECTED_CLASS}`)).toHaveLength(0);
  });

  it("boxes a code block and media a text selection covers whole", () => {
    const e = mount("<p>Before</p><pre><code>const a = 1</code></pre><hr><p>After</p>");
    e.view.dispatch(e.state.tr.setSelection(new AllSelection(e.state.doc)));
    const boxed = [...e.view.dom.querySelectorAll(`.${BLOCK_SELECTED_CLASS}`)].map((node) => node.nodeName);
    expect(boxed).toEqual(["PRE", "HR"]);
  });

  it("leaves node selections to ProseMirror's own class", () => {
    const e = mount("<p>Before</p><hr><p>After</p>");
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, posOf(e, "horizontalRule"))));
    expect(e.view.dom.querySelector("hr")?.classList.contains("ProseMirror-selectednode")).toBe(true);
    expect(e.view.dom.querySelectorAll(`.${BLOCK_SELECTED_CLASS}`)).toHaveLength(0);
  });

  it("changes nothing in the document, its HTML or its Markdown", () => {
    const e = mount("<p>Hello <code>x</code></p><ul><li><p>One</p></li></ul>");
    const markdown = (e.storage as unknown as { markdown: { getMarkdown(): string } }).markdown;
    // The first transaction adds the trailing paragraph and the block IDs.
    e.view.dispatch(e.state.tr);
    const before = { json: JSON.stringify(e.getJSON()), html: e.getHTML(), md: markdown.getMarkdown() };
    drag(e, 2, posOf(e, "paragraph", 1) + 2);
    expect(e.state.selection).toBeInstanceOf(BlockSelection);
    expect({ json: JSON.stringify(e.getJSON()), html: e.getHTML(), md: markdown.getMarkdown() }).toEqual(before);
    expect(before.html).not.toContain(BLOCK_SELECTED_CLASS);
  });
});

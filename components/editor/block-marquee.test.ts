// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { pageExtensions } from "@/components/pages/page-extensions";
import { EDITOR_RESERVE_ATTR, blocksInBox, startsMarquee } from "@/components/editor/block-marquee";

let pane: HTMLElement;
let root: HTMLElement;
let dom: HTMLElement;
let paragraph: HTMLElement;
let handle: HTMLElement;
let reserve: HTMLElement;
let title: HTMLElement;

beforeEach(() => {
  // pane > column > [title, root > [handle, dom > p, reserve]]
  document.body.innerHTML = `
    <div id="pane"><div id="column">
      <textarea id="title"></textarea>
      <div id="root">
        <button id="handle"></button>
        <div id="dom" contenteditable="true" style="padding-left: 96px; padding-right: 40px"><p id="p">Text</p></div>
        <div id="reserve" ${EDITOR_RESERVE_ATTR}></div>
      </div>
    </div></div>`;
  const byId = (id: string) => document.getElementById(id)!;
  [pane, root, dom, paragraph, handle, reserve, title] = ["pane", "root", "dom", "p", "handle", "reserve", "title"].map(byId);
  // The editor spans 0–736px; its text column is 96–696px.
  dom.getBoundingClientRect = () => new DOMRect(0, 0, 736, 400);
});

afterEach(() => {
  document.body.innerHTML = "";
});

it("starts from the pane and the column around the editor, and from the reserve under it", () => {
  expect(startsMarquee(pane, 10, root, dom)).toBe(true);
  expect(startsMarquee(document.getElementById("column"), 10, root, dom)).toBe(true);
  expect(startsMarquee(reserve, 300, root, dom)).toBe(true);
});

it("starts from the editor's bands beside its text, not from the text column", () => {
  expect(startsMarquee(dom, 40, root, dom)).toBe(true);
  expect(startsMarquee(dom, 720, root, dom)).toBe(true);
  expect(startsMarquee(dom, 300, root, dom)).toBe(false);
  expect(startsMarquee(paragraph, 40, root, dom)).toBe(false);
});

it("leaves their own press to fields, buttons and what lies beside the editor", () => {
  expect(startsMarquee(handle, 40, root, dom)).toBe(false);
  expect(startsMarquee(title, 300, root, dom)).toBe(false);
});

describe("the blocks a rectangle reaches", () => {
  let editor: Editor | null = null;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  /** A document laid out one 20px row per paragraph; a container spans the
      rows of its paragraphs. Returns the doc, a measure and the start of the
      node holding each text. */
  function layout(content: string) {
    editor = new Editor({
      element: document.body.appendChild(document.createElement("div")),
      content,
      extensions: pageExtensions({ headless: true, blocks: "page" }),
    });
    const { doc } = editor.state;
    const rows = new Map<number, [number, number]>();
    const startOf = new Map<string, number>();
    let row = 0;
    doc.descendants((node, pos) => {
      if (!node.isTextblock) return true;
      rows.set(pos, [row * 20, row * 20 + 20]);
      startOf.set(node.textContent, pos);
      row += 1;
      return false;
    });
    const rectOf = (pos: number) => {
      const node = doc.nodeAt(pos);
      if (!node) return null;
      let top = Infinity;
      let bottom = -Infinity;
      for (const [start, [rowTop, rowBottom]] of rows) {
        if (start >= pos && start < pos + node.nodeSize) {
          top = Math.min(top, rowTop);
          bottom = Math.max(bottom, rowBottom);
        }
      }
      return top === Infinity ? null : new DOMRect(0, top, 600, bottom - top);
    };
    /** The list item (or block) whose own text is `text`. */
    const itemOf = (text: string) => {
      const $pos = doc.resolve(startOf.get(text)!);
      return $pos.depth > 0 && ["listItem", "taskItem"].includes($pos.parent.type.name) ? $pos.before() : $pos.pos;
    };
    return { doc, rectOf, itemOf };
  }

  const rowsBox = (from: number, to: number) => ({ left: 10, right: 20, top: from * 20 + 5, bottom: to * 20 + 5 });

  it("reaches the list items under it, not the whole list", () => {
    const { doc, rectOf, itemOf } = layout("<p>A</p><ul><li><p>one</p></li><li><p>two</p></li><li><p>three</p></li></ul><p>B</p>");
    // Rows: A 0, one 1, two 2, three 3, B 4. The box covers rows 2 and 3.
    expect(blocksInBox(doc, rectOf, rowsBox(2, 3))).toEqual([itemOf("two"), itemOf("three")]);
  });

  it("reaches a nested item without its parent item", () => {
    const { doc, rectOf, itemOf } = layout(
      "<ul><li><p>one</p><ul><li><p>sub</p></li></ul></li><li><p>two</p></li></ul>"
    );
    // Rows: one 0, sub 1, two 2.
    expect(blocksInBox(doc, rectOf, rowsBox(1, 1))).toEqual([itemOf("sub")]);
    expect(blocksInBox(doc, rectOf, rowsBox(0, 0))).toEqual([itemOf("one")]);
  });

  it("still reaches first-level blocks whole", () => {
    const { doc, rectOf, itemOf } = layout("<p>A</p><blockquote><p>q1</p><p>q2</p></blockquote><p>B</p>");
    const quote = doc.resolve(itemOf("q2")).before();
    expect(blocksInBox(doc, rectOf, rowsBox(2, 3))).toEqual([quote, itemOf("B")]);
  });
});

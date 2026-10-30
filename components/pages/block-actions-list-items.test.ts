// @vitest-environment jsdom
//
// List items are blocks of their own in the gutter (block-gutter.tsx): the
// handle's `+` on an item adds an item to its list, never a paragraph between
// two items.
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { pageExtensions } from "@/components/pages/page-extensions";
import { insertBlockAround, selectBlockFromHandle, selectedBlockCount } from "@/components/pages/block-actions";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.innerHTML = "";
});

function mount(content: string): Editor {
  const element = document.body.appendChild(document.createElement("div"));
  editor = new Editor({ element, content, extensions: pageExtensions({ headless: true, blocks: "page" }) });
  return editor;
}

function posOf(target: Editor, name: string, index = 0): number {
  const found: number[] = [];
  target.state.doc.descendants((node, pos) => {
    if (node.type.name === name) found.push(pos);
  });
  return found[index];
}

describe("list items as gutter blocks", () => {
  it("adds a bullet below the hovered item, with the slash menu typed in it", () => {
    const target = mount("<ul><li><p>one</p></li><li><p>two</p></li></ul>");
    expect(insertBlockAround(target, posOf(target, "listItem", 0), "below")).toBe(true);
    const list = target.state.doc.firstChild!;
    expect(list.type.name).toBe("bulletList");
    expect(list.childCount).toBe(3);
    expect(list.child(1).textContent).toBe("/");
    expect(list.child(2).textContent).toBe("two");
  });

  it("adds an unchecked task above a task", () => {
    const target = mount('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>done</p></li></ul>');
    expect(insertBlockAround(target, posOf(target, "taskItem", 0), "above")).toBe(true);
    const list = target.state.doc.firstChild!;
    expect(list.childCount).toBe(2);
    expect(list.child(0).attrs.checked).toBe(false);
    expect(list.child(1).textContent).toBe("done");
  });

  it("selects one item from its handle, not the whole list", () => {
    const target = mount("<ol><li><p>a</p></li><li><p>b</p></li><li><p>c</p></li></ol>");
    expect(selectBlockFromHandle(target, posOf(target, "listItem", 1), false)).toBe(true);
    expect(selectedBlockCount(target)).toBe(1);
    expect(target.state.doc.textBetween(target.state.selection.from, target.state.selection.to)).toBe("b");
  });
});

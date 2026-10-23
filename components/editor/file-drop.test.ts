// @vitest-environment jsdom
//
// A dragged file lands between top-level blocks, never inside a task.
import { afterEach, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { pageExtensions } from "@/components/pages/page-extensions";
import { blockGapAt } from "./file-drop";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.innerHTML = "";
});

/** Each top-level block is 20px tall, stacked from y = 0. */
function gapAt(y: number) {
  const doc = editor!.state.doc;
  const offsets: number[] = [];
  doc.forEach((_node, offset) => offsets.push(offset));
  return blockGapAt(doc, y, (offset) => offsets.indexOf(offset) * 20 + 10);
}

function mount(content: string) {
  const element = document.body.appendChild(document.createElement("div"));
  editor = new Editor({
    element,
    content,
    extensions: pageExtensions({ headless: true, blocks: "document" }),
  });
  return editor;
}

it("picks the gap nearest the pointer", () => {
  const ed = mount("<p>One</p><p>Two</p><p>Three</p>");
  const second = ed.state.doc.child(0).nodeSize;
  expect(gapAt(2)).toBe(0);
  expect(gapAt(12)).toBe(second);
  expect(gapAt(25)).toBe(second);
  expect(gapAt(500)).toBe(ed.state.doc.content.size);
});

it("never lands inside a task list", () => {
  const ed = mount(
    '<p>Intro</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>A</p></li>' +
      '<li data-type="taskItem" data-checked="false"><p>B</p></li></ul><p>End</p>'
  );
  const doc = ed.state.doc;
  // Below the middle of the task list: after the whole list.
  const gap = gapAt(35);
  expect(doc.resolve(gap).depth).toBe(0);
  expect(gap).toBe(doc.child(0).nodeSize + doc.child(1).nodeSize);
});

// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { HeadingFromListInput } from "@/components/scratchpad/heading-from-list-input";
import { ScratchpadParagraph } from "@/components/scratchpad/scratchpad-paragraph";
import {
  ScratchpadTaskItemBase,
  ScratchpadTaskList,
} from "@/components/scratchpad/task-nodes";

const openEditors: Editor[] = [];

afterEach(() => {
  for (const editor of openEditors.splice(0)) editor.destroy();
});

function makeEditor(content = ""): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    content,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, paragraph: false }),
      ScratchpadParagraph,
      ScratchpadTaskList,
      ScratchpadTaskItemBase,
      HeadingFromListInput,
      Markdown.configure({ html: false, linkify: true }),
    ] as never,
  });
  openEditors.push(editor);
  return editor;
}

function type(editor: Editor, text: string): void {
  for (const character of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp("handleTextInput", (handler) =>
      handler(editor.view, from, to, character, () =>
        editor.state.tr.insertText(character, from, to)
      )
    );
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(character, from, to));
  }
}

function markdown(editor: Editor): string {
  return (
    editor.storage as unknown as { markdown: { getMarkdown(): string } }
  ).markdown.getMarkdown();
}

function containsHeading(editor: Editor, level: number): boolean {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "heading" && node.attrs.level === level) found = true;
  });
  return found;
}

describe("headings started from scratchpad lists", () => {
  it("turns an empty task opened with Enter into a heading", () => {
    const editor = makeEditor("- [ ] Finish the release notes");
    editor.commands.focus("end");
    editor.commands.splitListItem("taskItem");

    type(editor, "# Shipping checklist");

    expect(markdown(editor)).toBe(
      "- [ ] Finish the release notes\n\n# Shipping checklist"
    );
    expect(containsHeading(editor, 1)).toBe(true);
  });

  it("also exits nested task lists before creating the heading", () => {
    const editor = makeEditor("- [ ] Parent\n  - [ ] Child");
    editor.commands.focus("end");
    editor.commands.splitListItem("taskItem");

    type(editor, "## Detail");

    expect(markdown(editor)).toBe("- [ ] Parent\n  - [ ] Child\n\n## Detail");
    expect(containsHeading(editor, 2)).toBe(true);
  });

  it("keeps a literal hash when it is not an empty list-item heading marker", () => {
    const editor = makeEditor("- [ ] Keep this note");
    editor.commands.focus("end");

    type(editor, " # literal");

    expect(markdown(editor)).toBe("- [ ] Keep this note # literal");
  });
});

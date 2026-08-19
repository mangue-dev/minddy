// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { ScratchpadParagraph } from "@/components/scratchpad/scratchpad-paragraph";
import {
  ScratchpadTaskItemBase,
  ScratchpadTaskList,
} from "@/components/scratchpad/task-nodes";
import { pasteScratchpadMarkdown } from "@/components/scratchpad/paste-markdown";
import {
  containsScratchpadMarkdown,
  containsScratchpadMarkdownBlock,
} from "@/lib/scratchpad";

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
      Markdown.configure({ html: false, linkify: true }),
    ] as never,
  });
  openEditors.push(editor);
  return editor;
}

function markdown(editor: Editor): string {
  return (
    editor.storage as unknown as { markdown: { getMarkdown(): string } }
  ).markdown.getMarkdown();
}

describe("scratchpad Markdown paste detection", () => {
  it("recognizes block and inline Markdown without matching ordinary prose", () => {
    expect(containsScratchpadMarkdownBlock("## Heading")).toBe(true);
    expect(containsScratchpadMarkdown("**Important** details")).toBe(true);
    expect(containsScratchpadMarkdown("Read the release notes")).toBe(false);
  });

  it("turns a rich clipboard's Markdown text into rendered nodes", () => {
    const editor = makeEditor();
    const source = "## Release notes\n\n**Important** [details](https://example.com)";

    expect(pasteScratchpadMarkdown(editor, source)).toBe(true);
    expect(editor.isActive("heading", { level: 2 })).toBe(false);
    expect(editor.state.doc.firstChild?.type.name).toBe("heading");
    expect(markdown(editor)).toBe(source);
  });

  it("keeps ordinary rich-text clipboard content on ProseMirror's default path", () => {
    const editor = makeEditor();

    expect(pasteScratchpadMarkdown(editor, "Plain copied text")).toBe(false);
  });
});

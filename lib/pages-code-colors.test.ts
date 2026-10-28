// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { pageExtensions } from "@/components/pages/page-extensions";
import { PAGE_COLOR_MARK, setPageColor } from "@/components/pages/blocks";

function editorWithCode() {
  return new Editor({
    extensions: pageExtensions({ headless: true }) as never,
    content: {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [{ type: "text", text: "const answer = 42" }],
        },
      ],
    },
  });
}

describe("colors in a code block", () => {
  it("colors the selected code, and only with the page's color marks", () => {
    const editor = editorWithCode();
    editor.commands.setTextSelection({ from: 7, to: 13 });

    expect(setPageColor(editor, "text", "red")).toBe(true);
    const code = editor.getJSON().content?.[0];
    expect(code?.content?.some((part) =>
      part.marks?.some((mark) => mark.type === PAGE_COLOR_MARK.text && mark.attrs?.color === "red")
    )).toBe(true);

    // Formatting still does not apply inside code.
    expect(editor.can().toggleBold()).toBe(false);
    editor.destroy();
  });

  it("keeps the Markdown a plain fence: the color is not projected", () => {
    const editor = editorWithCode();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    setPageColor(editor, "background", "green");

    const markdown = (editor.storage as unknown as { markdown: { getMarkdown(): string } })
      .markdown.getMarkdown();
    expect(markdown).toBe("```ts\nconst answer = 42\n```");
    editor.destroy();
  });
});

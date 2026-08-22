// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import { CODE_LANGUAGE_OPTIONS } from "@/components/code-block-language-catalog";
import { blockExtensions } from "@/components/pages/blocks";

function makeEditor(editable = false) {
  return new Editor({
    element: document.createElement("div"),
    editable,
    content: {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "typescript" },
          content: [{ type: "text", text: "const answer = 42" }],
        },
      ],
    },
    extensions: [Document, Text, ...blockExtensions()] as never,
  });
}

describe("TipTap code block node view", () => {
  it("offers a broad searchable language catalog", () => {
    expect(CODE_LANGUAGE_OPTIONS.length).toBeGreaterThan(180);
    expect(CODE_LANGUAGE_OPTIONS.map((option) => option.value)).toEqual(
      expect.arrayContaining(["javascript", "typescript", "python", "rust"]),
    );
  });

  it("renders syntax decorations and a working copy button on pages", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const editor = makeEditor();
    const button = editor.view.dom.querySelector<HTMLButtonElement>(
      ".code-block-node-copy",
    );

    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-label")).toBe("Copy");
    expect(button?.textContent).toBe("");
    expect(button?.querySelector("svg")).not.toBeNull();
    expect(editor.view.dom.querySelector(".hljs-keyword")).not.toBeNull();

    button?.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("const answer = 42"));

    editor.destroy();
  });

  it("persists a language edited in the block header", () => {
    const editor = makeEditor(true);
    const language = editor.view.dom.querySelector<HTMLInputElement>(
      ".code-block-node-language",
    );

    expect(language?.value).toBe("typescript");
    if (!language) throw new Error("The code language input was not rendered");

    language.value = "javascript";
    language.dispatchEvent(new Event("input", { bubbles: true }));

    expect(editor.getJSON().content?.[0]?.attrs?.language).toBe("javascript");
    editor.destroy();
  });
});

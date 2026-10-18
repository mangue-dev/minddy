// @vitest-environment jsdom
//
// What a description or notebook editor opens (MIN-728). The Markdown is the
// authority — agents, the forge and imports only ever write Markdown — and the
// stored document only adds what Markdown cannot carry, as long as it still
// says the same thing.
import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { bodyFromMarkdown, bodyToMarkdown, documentForEditor } from "@/lib/pages-markdown";
import { SPACER_LINE } from "@/lib/scratchpad";

const paragraph = (text: string, blockId: string, marks?: JSONContent["marks"]): JSONContent => ({
  type: "paragraph",
  attrs: { blockId },
  content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
});

const stored: JSONContent = {
  type: "doc",
  content: [
    paragraph("Context", "keep-me"),
    paragraph("Old step", "rewritten"),
  ],
};

describe("documentForEditor", () => {
  it("opens the stored document while it still says the Markdown", () => {
    expect(documentForEditor("Context\n\nOld step", stored)).toBe(stored);
  });

  it("keeps the blocks an agent did not touch when the Markdown moved on", () => {
    const opened = documentForEditor("Context\n\nNew step\n\nAdded by Numo", stored) as JSONContent;
    expect(bodyToMarkdown(opened, "document")).toBe("Context\n\nNew step\n\nAdded by Numo");
    const ids = opened.content!.map((block) => block.attrs?.blockId);
    // Untouched block kept as stored; the rewritten one keeps its identity.
    expect(ids[0]).toBe("keep-me");
    expect(ids[1]).toBe("rewritten");
    expect(ids[2]).toEqual(expect.any(String));
  });

  it("opens the Markdown without a document, or with one it cannot read", () => {
    expect(documentForEditor("Plain", null)).toBe("Plain");
    expect(documentForEditor("Plain", { type: "paragraph" })).toBe("Plain");
  });

  it("keeps the notebook's deliberate empty lines when comparing", () => {
    const markdown = ["- [ ] One", "", SPACER_LINE, "", "- [x] Two"].join("\n");
    const document = bodyFromMarkdown(markdown, "notebook");
    expect(bodyToMarkdown(document, "notebook")).toBe(markdown);
    expect(documentForEditor(markdown, document, "notebook")).toBe(document);
  });

  it("does not let a page-tree block into a description", () => {
    const parsed = bodyFromMarkdown("[[page:11111111-1111-4111-8111-111111111111]]", "document");
    expect(JSON.stringify(parsed)).not.toContain('"subpage"');
  });
});

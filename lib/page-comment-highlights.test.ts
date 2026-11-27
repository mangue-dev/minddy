import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { pageBlockContentRanges, pageCommentHighlightRanges, pageCommentQuoteInBlock } from "./page-comment-highlights";
import {
  arrangeThreads,
  commentedBlockAnnotations,
  type PageComment,
} from "./page-comments";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*" },
    text: {},
  },
  marks: {
    strong: {},
  },
});

function comment(overrides: Partial<PageComment> = {}): PageComment {
  return {
    id: "comment",
    page_id: "page",
    project_id: "project",
    block_id: "block",
    quote: null,
    body: "Comment",
    author_id: "user",
    parent_id: null,
    created_at: "2026-08-29T10:00:00.000Z",
    updated_at: "2026-08-29T10:00:00.000Z",
    ...overrides,
  };
}

describe("page comment passage highlights", () => {
  it("keeps the excerpts together with the block message count", () => {
    const root = comment({ quote: "selected passage" });
    const reply = comment({ id: "reply", parent_id: root.id, quote: null });
    const annotations = commentedBlockAnnotations(
      arrangeThreads([root, reply], new Set(["block"]))
    );

    expect(annotations.get("block")).toEqual({
      count: 2,
      quotes: ["selected passage"],
      whole: false,
    });
  });

  it("resolves an excerpt across formatting marks", () => {
    const strong = schema.marks.strong.create();
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text("A selected "),
      schema.text("passage", [strong]),
      schema.text(" remains here."),
    ]);

    expect(pageCommentHighlightRanges(paragraph, 0, ["selected passage"]))
      .toEqual([{ from: 3, to: 19 }]);
  });

  it("matches normalized whitespace and ignores stale excerpts", () => {
    const paragraph = schema.nodes.paragraph.create(
      null,
      schema.text("A selected   passage remains here.")
    );

    expect(pageCommentHighlightRanges(paragraph, 0, ["selected passage"]))
      .toEqual([{ from: 3, to: 21 }]);
    expect(pageCommentHighlightRanges(paragraph, 0, ["removed passage"]))
      .toEqual([]);
  });
});

describe("a quote that still reads in its block", () => {
  const paragraph = schema.nodes.paragraph.create(
    null,
    schema.text("A selected   passage remains here.")
  );

  it("is found whatever the whitespace, and missed once rewritten or empty", () => {
    expect(pageCommentQuoteInBlock(paragraph, " selected passage ")).toBe(true);
    expect(pageCommentQuoteInBlock(paragraph, "removed passage")).toBe(false);
    expect(pageCommentQuoteInBlock(paragraph, "  ")).toBe(false);
    expect(pageCommentQuoteInBlock(paragraph, null)).toBe(false);
  });
});

describe("a comment on a whole block", () => {
  const blocks = new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: { group: "block", content: "text*" },
      codeBlock: { group: "block", content: "text*", code: true },
      bulletList: { group: "block", content: "listItem+" },
      listItem: { content: "paragraph+" },
      divider: { group: "block", atom: true },
      text: {},
    },
  });
  const paragraph = (text?: string) => blocks.nodes.paragraph.create(null, text ? blocks.text(text) : undefined);

  it("is flagged as soon as one thread of the block quotes no passage", () => {
    const quoted = comment({ id: "quoted", quote: "selected passage" });
    const whole = comment({ id: "whole", quote: null });
    const live = new Set(["block"]);
    expect(commentedBlockAnnotations(arrangeThreads([quoted], live)).get("block")?.whole).toBe(false);
    expect(commentedBlockAnnotations(arrangeThreads([quoted, whole], live)).get("block")).toEqual({
      count: 2,
      quotes: ["selected passage"],
      whole: true,
    });
  });

  it("marks every line of a list, and skips the empty ones", () => {
    const list = blocks.nodes.bulletList.create(null, [
      blocks.nodes.listItem.create(null, paragraph("One")),
      blocks.nodes.listItem.create(null, paragraph()),
      blocks.nodes.listItem.create(null, paragraph("Three")),
    ]);
    // list 0 › item 1 › paragraph 2 › "One" from 3.
    expect(pageBlockContentRanges(list, 0)).toEqual([
      { from: 3, to: 6 },
      { from: 14, to: 19 },
    ]);
  });

  it("marks the text of a code block, line breaks included", () => {
    const code = blocks.nodes.codeBlock.create(null, blocks.text("const a = 1;\n  return a;"));
    expect(pageBlockContentRanges(code, 10)).toEqual([{ from: 11, to: 11 + code.content.size }]);
  });

  it("has nothing to mark in a block with no text", () => {
    expect(pageBlockContentRanges(blocks.nodes.divider.create(), 0)).toEqual([]);
  });

  it("finds a quote that still carries the line breaks of its selection", () => {
    const code = blocks.nodes.codeBlock.create(null, blocks.text("const a = 1;\n  return a;"));
    expect(pageCommentHighlightRanges(code, 0, ["a = 1;\n  return"])).toEqual([{ from: 7, to: 22 }]);
  });

  it("finds a quote that was cut with an ellipsis", () => {
    const block = paragraph("A long passage that goes on and on.");
    expect(pageCommentHighlightRanges(block, 0, ["long passage that…"])).toEqual([{ from: 3, to: 20 }]);
  });
});

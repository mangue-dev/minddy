import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { pageCommentHighlightRanges } from "./page-comment-highlights";
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

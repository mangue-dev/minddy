// @vitest-environment jsdom
//
// One editor engine, several catalogs (MIN-728). The `document` set that
// descriptions, comments and the notebook mount is the page catalog without
// the page-tree blocks, and the notebook's own Markdown — deliberate empty
// lines, the four task states, nesting — must survive that schema unchanged,
// because the MCP and Numo notebook tools read it line by line.
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { blocksIn, slashItems, PAGE_BLOCKS } from "@/components/pages/blocks";
import { pageExtensions } from "@/components/pages/page-extensions";
import { ScratchpadParagraph } from "@/components/scratchpad/scratchpad-paragraph";
import { SPACER_LINE } from "@/lib/scratchpad";
import { parsePlan } from "@/lib/plan";

function roundTrip(markdown: string, options: Parameters<typeof pageExtensions>[0]): string {
  const editor = new Editor({
    element: document.createElement("div"),
    content: markdown,
    extensions: pageExtensions({ headless: true, ...options }),
  });
  try {
    return (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();
  } finally {
    editor.destroy();
  }
}

describe("editor block sets", () => {
  it("keeps the page tree out of documents and everything else in", () => {
    const document = blocksIn("document").map((block) => block.id);
    expect(document).not.toContain("subpage");
    expect(document).toHaveLength(PAGE_BLOCKS.length - 1);
    expect(blocksIn("page")).toBe(PAGE_BLOCKS);
  });

  it("offers uploads only to a surface that can upload", () => {
    const withoutUploads = slashItems({ set: "document", uploads: "none" }).map((block) => block.id);
    expect(withoutUploads).not.toContain("image");
    expect(withoutUploads).not.toContain("file");
    expect(withoutUploads).toContain("callout");
    expect(slashItems().map((block) => block.id)).toContain("subpage");
    // Outside pages, uploads are images only (MIN-728).
    const imagesOnly = slashItems({ set: "document", uploads: "images" }).map((block) => block.id);
    expect(imagesOnly).toContain("image");
    expect(imagesOnly).not.toContain("file");
  });

  it("mounts no subpage node in the document schema", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: pageExtensions({ headless: true, blocks: "document" }),
    });
    try {
      expect(editor.schema.nodes.subpage).toBeUndefined();
      expect(editor.schema.nodes.taskItem).toBeDefined();
    } finally {
      editor.destroy();
    }
  });
});

describe("the notebook on the document schema", () => {
  const notebook = [
    "## Today",
    "",
    "- [ ] Write the release notes",
    "  - [~] Collect the merged PRs",
    "- [x] Fix the flaky test",
    "- [-] Drop the old flag",
    "",
    SPACER_LINE,
    "",
    "### Later",
    "",
    "Ping @Clément about MIN-42",
  ].join("\n");

  it("round-trips tasks, nesting and deliberate empty lines", () => {
    expect(
      roundTrip(notebook, { blocks: "document", extensions: { paragraph: ScratchpadParagraph } })
    ).toBe(notebook);
  });
});

describe("issue plans on the document schema", () => {
  // Plans are edited live (MIN-728); agents address their tasks by position,
  // so the Markdown the editor writes back must keep every task as it was.
  const plan = [
    "## Context",
    "",
    "Goal: one editor.",
    "",
    "## Steps",
    "",
    "- [x] Extract the engine",
    "- [~] Split the extensions",
    "- [ ] Switch the readers:",
    "  - forge sync;",
    "  - MCP tools;",
    "  - [ ] the nested check",
    "- [-] Backfill",
    "",
    "## Questions",
    "",
    "- [ ] Keep the textarea?",
  ].join("\n");

  it("keeps every task, its state, depth and text", () => {
    const back = roundTrip(plan, { blocks: "document" });
    const shape = (markdown: string) =>
      parsePlan(markdown).tasks.map(({ state, depth, text, question }) => ({ state, depth, text, question }));
    expect(shape(back)).toEqual(shape(plan));
    expect(back).not.toMatch(/^\s*- \[ \]\s*$/m);
  });

  it("splits a list mixing bullets and tasks without inventing an empty task", () => {
    expect(roundTrip("- a\n- [ ] b", { blocks: "document" })).toBe("- a\n\n- [ ] b");
    expect(roundTrip("- [ ] t\n  - a\n  - [ ] b", { blocks: "document" })).toBe("- [ ] t\n  - a\n  - [ ] b");
  });
});

import { describe, expect, it } from "vitest";
import { buildPageContextBlock } from "./prompt";

describe("assistant selected-items context (MIN-873)", () => {
  it("lists every selected record with its id and the tools that act on its kind", () => {
    const block = buildPageContextBlock({
      projectId: "project-1",
      selectedItems: [
        { kind: "feedback", id: "fb-1", label: "Dark mode" },
        { kind: "feedback", id: "fb-2", label: "Export to CSV" },
      ],
    });
    expect(block).toContain("Selected feedback posts (2):");
    expect(block).toContain(`"Dark mode" (id: fb-1)`);
    expect(block).toContain(`"Export to CSV" (id: fb-2)`);
    expect(block).toContain("get_feedback");
    expect(block).toContain("use project-1");
  });

  it("names wiki pages by page id and steers writes away from full rewrites", () => {
    const block = buildPageContextBlock({
      selectedItems: [{ kind: "page", id: "page-1", label: "  " }],
    });
    expect(block).toContain(`"(untitled)" (page id: page-1)`);
    expect(block).toContain("edit_page_text");
  });
});

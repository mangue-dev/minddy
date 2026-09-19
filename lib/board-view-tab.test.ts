import { describe, expect, it } from "vitest";
import { boardViewTabHref } from "@/lib/board-view-tab";

describe("kanban view tab href", () => {
  it("opens custom and system views with stable deep links", () => {
    expect(
      boardViewTabHref("/projects/p", "issue=i&family=f", {
        id: "view-1",
        kind: "custom",
      }),
    ).toBe("/projects/p?view=view-1");
    expect(
      boardViewTabHref("/all", "", { id: "generated-id", kind: "my" }),
    ).toBe("/all?view=my");
  });

  it("addresses cycle mode explicitly", () => {
    expect(boardViewTabHref("/all", "issue=i", "cycle")).toBe(
      "/all?view=cycle",
    );
  });
});

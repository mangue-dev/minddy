import { describe, expect, it } from "vitest";
import { orderByCategoryRank } from "./category-order";

type Row = { id: string; filterCategory: string };

describe("orderByCategoryRank", () => {
  it("orders category ranks and preserves row order inside each rank", () => {
    const rows: Row[] = [
      { id: "issue-1", filterCategory: "issues" },
      { id: "command-1", filterCategory: "commands" },
      { id: "issue-2", filterCategory: "issues" },
      { id: "page-1", filterCategory: "pages" },
    ];

    expect(
      orderByCategoryRank(rows, { commands: 0, pages: 1, issues: 2 }).map(
        (row) => row.id,
      ),
    ).toEqual(["command-1", "page-1", "issue-1", "issue-2"]);
  });

  it("keeps the original interleaving for categories with the same rank", () => {
    const rows: Row[] = [
      { id: "a-1", filterCategory: "a" },
      { id: "b-1", filterCategory: "b" },
      { id: "a-2", filterCategory: "a" },
      { id: "unknown", filterCategory: "unknown" },
    ];

    expect(orderByCategoryRank(rows, { a: 1, b: 1 }).map((row) => row.id)).toEqual([
      "a-1",
      "b-1",
      "a-2",
      "unknown",
    ]);
  });
});

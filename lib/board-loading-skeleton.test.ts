import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

describe("board loading shell", () => {
  it("uses one complete skeleton for route and data loading", () => {
    const routeSkeletons = readFileSync(
      join(ROOT, "components/route-skeletons.tsx"),
      "utf8",
    );
    const skeleton = readFileSync(
      join(ROOT, "components/board-loading-skeleton.tsx"),
      "utf8",
    );

    expect(routeSkeletons).toContain("<BoardLoadingSkeleton");
    expect(skeleton).toContain("data-board-skeleton-special-title");
    expect(skeleton).toContain("data-board-skeleton-column");
    expect(skeleton).toContain("data-board-skeleton-card");
    expect(skeleton).toContain("data-board-skeleton-create-issue");
    expect(skeleton).toContain("BOARD_SCROLLER_CLASS");
    expect(skeleton).toContain("BOARD_COLUMN_CLASS");
  });

  it("keeps the global title exclusive to the Cycle selector", () => {
    const board = readFileSync(
      join(ROOT, "components/global-board.tsx"),
      "utf8",
    );
    const header = board.slice(
      board.indexOf('<div className="flex shrink-0 flex-col gap-3 px-6 pt-4">'),
      board.indexOf("<BoardToolbar"),
    );

    expect(header).toContain("<CycleTitleSelector");
    expect(header).not.toContain("<h1");
    expect(header).not.toContain('t("allTitle")');
  });
});

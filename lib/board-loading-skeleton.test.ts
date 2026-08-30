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
    expect(skeleton).toContain("data-board-skeleton-header");
    expect(skeleton).toContain("data-board-skeleton-column");
    expect(skeleton).toContain("data-board-skeleton-card");
    expect(skeleton).toContain("data-board-skeleton-create-issue");
    expect(skeleton).toContain("BOARD_SCROLLER_CLASS");
    expect(skeleton).toContain("BOARD_COLUMN_CLASS");
  });

  it("keeps views and cycle controls in the shared board header", () => {
    const board = readFileSync(
      join(ROOT, "components/global-board.tsx"),
      "utf8",
    );
    const toolbar = readFileSync(
      join(ROOT, "components/board-toolbar.tsx"),
      "utf8",
    );
    const cycleHeader = readFileSync(
      join(ROOT, "components/cycle/cycle-header.tsx"),
      "utf8",
    );
    const cycleControls = cycleHeader.slice(
      cycleHeader.indexOf("export function CycleControls"),
    );

    expect(toolbar).toContain("<AppContentHeader");
    expect(board).toContain("<BoardToolbar");
    expect(board).not.toContain("CycleAskNumo");
    expect(cycleControls.indexOf("<RingStat")).toBeLessThan(
      cycleControls.indexOf("<CycleTitleSelector"),
    );
    expect(cycleControls.indexOf("<CycleTitleSelector")).toBeLessThan(
      cycleControls.indexOf("<Settings"),
    );
  });
});

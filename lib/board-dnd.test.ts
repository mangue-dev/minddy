import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ClientRect, DroppableContainer } from "@dnd-kit/core";
import { BOARD_MOUSE_ACTIVATION_DISTANCE, boardCollision } from "./board-dnd";

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): ClientRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

/** A status column is the board's only kind of dnd-kit drop target. */
function droppable(id: string): DroppableContainer {
  return {
    id,
    key: id,
    disabled: false,
    node: { current: null },
    rect: { current: null },
    data: { current: undefined },
  } as unknown as DroppableContainer;
}

/**
 * Two side-by-side columns 400 px high. Card geometry is intentionally absent
 * from dnd-kit; manual insertion is resolved by the board itself.
 */
const RECTS = new Map<string, ClientRect>([
  ["todo", rect(0, 0, 300, 400)],
  ["in_progress", rect(320, 0, 300, 400)],
]);

const CONTAINERS = [droppable("todo"), droppable("in_progress")];

function collide(pointer: { x: number; y: number }, held: ClientRect) {
  return boardCollision({
    active: {
      id: "dragged",
      data: { current: undefined },
      rect: { current: { initial: held, translated: held } },
    },
    collisionRect: held,
    droppableRects: RECTS as never,
    droppableContainers: CONTAINERS,
    pointerCoordinates: pointer,
  } as never).map((c) => String(c.id));
}

describe("board pointer collision", () => {
  it("publishes only the pointer's column", () => {
    expect(collide({ x: 150, y: 180 }, rect(10, 130, 280, 100))).toEqual([
      "todo",
    ]);
  });

  it("keeps card gaps inside the same column target", () => {
    expect(collide({ x: 150, y: 122 }, rect(10, 120, 280, 100))).toEqual([
      "todo",
    ]);
  });

  it("keeps the area below the stack inside the same column target", () => {
    expect(collide({ x: 150, y: 370 }, rect(10, 320, 280, 100))).toEqual([
      "todo",
    ]);
  });

  it("targets an empty column", () => {
    expect(collide({ x: 470, y: 200 }, rect(330, 150, 280, 100))).toEqual([
      "in_progress",
    ]);
  });

  it("stays in the pointer's column when neighboring cards are closer", () => {
    // Pointer in “In progress” (empty), card held astride “To do”:
    // at the corners, the cards on the left won — and the flyover went next.
    expect(collide({ x: 330, y: 180 }, rect(60, 130, 280, 100))).toEqual([
      "in_progress",
    ]);
  });

  it("targets the nearest column in a horizontal gutter", () => {
    // Gutter between the two columns: `closestCorners` slice.
    expect(collide({ x: 310, y: 180 }, rect(160, 130, 280, 100))).toHaveLength(
      1,
    );
  });

  it("returns no target above or below the visible card area", () => {
    expect(collide({ x: 150, y: -20 }, rect(10, -70, 280, 100))).toEqual([]);
    expect(collide({ x: 150, y: 420 }, rect(10, 370, 280, 100))).toEqual([]);
  });

  it("activates after the first deliberate mouse movement", () => {
    expect(BOARD_MOUSE_ACTIVATION_DISTANCE).toBe(1);
  });
});

describe("board drag architecture", () => {
  it("keeps sortable subscriptions and interactive cards out of the hot path", () => {
    const issueCard = readFileSync(
      join(process.cwd(), "components/issue-card.tsx"),
      "utf8",
    );
    const columns = ["kanban-column.tsx", "global-kanban-column.tsx"].map(
      (file) => readFileSync(join(process.cwd(), "components", file), "utf8"),
    );
    const boards = ["kanban-board.tsx", "global-kanban-board.tsx"].map((file) =>
      readFileSync(join(process.cwd(), "components", file), "utf8"),
    );

    expect(issueCard).toContain("useDraggable");
    expect(issueCard).not.toContain("useSortable");
    for (const source of columns)
      expect(source).not.toContain("SortableContext");
    for (const source of columns)
      expect(source).toContain("BoardDropLandingPlaceholder");
    for (const source of boards) {
      expect(source).toContain("captureBoardDragPreview");
      expect(source).not.toContain("<IssueCardBody");
    }
  });
});

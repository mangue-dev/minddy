import { describe, expect, it } from "vitest";
import type { ClientRect, DroppableContainer } from "@dnd-kit/core";
import { boardCollision } from "./board-dnd";

function rect(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

/** A drop target: a column (no `columnStatus`) or a card. */
function droppable(id: string, columnStatus?: string): DroppableContainer {
  return {
    id,
    key: id,
    disabled: false,
    node: { current: null },
    rect: { current: null },
    data: { current: columnStatus ? { columnStatus } : undefined },
  } as unknown as DroppableContainer;
}

/**
 * Two side-by-side columns 400 px high. “To do” carries three cards of
 * 100 px spaced 20 apart; “In progress” carries none.
 */
const RECTS = new Map<string, ClientRect>([
  ["todo", rect(0, 0, 300, 400)],
  ["in_progress", rect(320, 0, 300, 400)],
  ["a", rect(10, 10, 280, 100)],
  ["b", rect(10, 130, 280, 100)],
  ["c", rect(10, 250, 280, 100)],
]);

const CONTAINERS = [
  droppable("todo"),
  droppable("in_progress"),
  droppable("a", "todo"),
  droppable("b", "todo"),
  droppable("c", "todo"),
];

function collide(pointer: { x: number; y: number }, held: ClientRect) {
  return boardCollision({
    active: {
      id: "glissée",
      data: { current: undefined },
      rect: { current: { initial: held, translated: held } },
    },
    collisionRect: held,
    droppableRects: RECTS as never,
    droppableContainers: CONTAINERS,
    pointerCoordinates: pointer,
  } as never).map((c) => String(c.id));
}

describe("ce que le pointeur désigne sur un board", () => {
  it("désigne la carte sous le pointeur, pas sa colonne", () => {
    expect(collide({ x: 150, y: 180 }, rect(10, 130, 280, 100))).toEqual(["b"]);
  });

  it("désigne la carte la plus proche dans le vide entre deux cartes", () => {
    // y = 122: in the gutter a/b, the held card overlapping especially b.
    expect(collide({ x: 150, y: 122 }, rect(10, 120, 280, 100))).toEqual(["b"]);
  });

  it("désigne la dernière carte sous le bas de la pile, jamais la colonne", () => {
    // The large rectangle of the column gained here, and the deposit mark
    // jumped at the end of the column while the gesture was aimed at the 3rd card.
    expect(collide({ x: 150, y: 370 }, rect(10, 320, 280, 100))).toEqual(["c"]);
  });

  it("désigne la colonne quand elle est vide", () => {
    expect(collide({ x: 470, y: 200 }, rect(330, 150, 280, 100))).toEqual([
      "in_progress",
    ]);
  });

  it("reste dans la colonne du pointeur même si les cartes voisines sont plus proches", () => {
    // Pointer in “In progress” (empty), card held astride “To do”:
    // at the corners, the cards on the left won — and the flyover went next.
    expect(collide({ x: 330, y: 180 }, rect(60, 130, 280, 100))).toEqual([
      "in_progress",
    ]);
  });

  it("répond quand même hors de toute colonne", () => {
    // Gutter between the two columns: `closestCorners` slice.
    expect(collide({ x: 310, y: 180 }, rect(160, 130, 280, 100))).toHaveLength(1);
  });
});

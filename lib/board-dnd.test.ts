import { describe, expect, it } from "vitest";
import type { ClientRect, DroppableContainer } from "@dnd-kit/core";
import { boardCollision } from "./board-dnd";

function rect(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

/** Une cible de dépôt : une colonne (pas de `columnStatus`) ou une carte. */
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
 * Deux colonnes côte à côte de 400 px de haut. « À faire » porte trois cartes de
 * 100 px espacées de 20 ; « En cours » n'en porte aucune.
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
    // y = 122 : dans la gouttière a/b, la carte tenue chevauchant surtout b.
    expect(collide({ x: 150, y: 122 }, rect(10, 120, 280, 100))).toEqual(["b"]);
  });

  it("désigne la dernière carte sous le bas de la pile, jamais la colonne", () => {
    // Le grand rectangle de la colonne gagnait ici, et le repère de dépôt
    // sautait en fin de colonne alors que le geste visait la 3e carte.
    expect(collide({ x: 150, y: 370 }, rect(10, 320, 280, 100))).toEqual(["c"]);
  });

  it("désigne la colonne quand elle est vide", () => {
    expect(collide({ x: 470, y: 200 }, rect(330, 150, 280, 100))).toEqual([
      "in_progress",
    ]);
  });

  it("reste dans la colonne du pointeur même si les cartes voisines sont plus proches", () => {
    // Pointeur dans « En cours » (vide), carte tenue à cheval sur « À faire » :
    // aux coins, les cartes de gauche gagnaient — et le survol partait à côté.
    expect(collide({ x: 330, y: 180 }, rect(60, 130, 280, 100))).toEqual([
      "in_progress",
    ]);
  });

  it("répond quand même hors de toute colonne", () => {
    // Gouttière entre les deux colonnes : `closestCorners` tranche.
    expect(collide({ x: 310, y: 180 }, rect(160, 130, 280, 100))).toHaveLength(1);
  });
});

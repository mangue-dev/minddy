import { describe, expect, it } from "vitest";
import { dragBundle, displayRank, planBoardMove } from "./board-drag";
import type { Issue } from "./types";
import type { IssueStatus } from "./issue-constants";

/** Un ticket réduit à ce que le glisser regarde. */
function issue(id: string, status: IssueStatus, position: number): Issue {
  return { id, status, position } as Issue;
}

const todo = [issue("a", "todo", 0), issue("b", "todo", 10), issue("c", "todo", 20)];
const doing = [issue("x", "in_progress", 0), issue("y", "in_progress", 10)];
const byId = new Map([...todo, ...doing].map((i) => [i.id, i]));
const rank = displayRank([{ items: todo }, { items: doing }]);

describe("ce qu'un glisser embarque", () => {
  it("prend toute la sélection quand la carte saisie en fait partie", () => {
    const bundle = dragBundle("c", new Set(["a", "c", "x"]), byId, rank);
    // Ordre d'affichage, pas ordre des ⇧-clics.
    expect(bundle.map((i) => i.id)).toEqual(["a", "c", "x"]);
  });

  it("ne prend que la carte saisie quand elle est hors sélection", () => {
    const bundle = dragBundle("b", new Set(["a", "c"]), byId, rank);
    expect(bundle.map((i) => i.id)).toEqual(["b"]);
  });

  it("ne prend que la carte saisie quand elle est seule sélectionnée", () => {
    expect(dragBundle("a", new Set(["a"]), byId, rank).map((i) => i.id)).toEqual(["a"]);
  });
});

describe("tri manuel", () => {
  it("insère le paquet entre les deux voisins du dépôt, dans l'ordre", () => {
    const bundle = dragBundle("x", new Set(["x", "y"]), byId, rank);
    const moves = planBoardMove({
      bundle,
      targetStatus: "todo",
      overIssueId: "c", // on lâche sur la 3e carte de « À faire »
      columnItems: todo,
      manual: true,
      now: 0,
    });
    expect(moves.map((m) => m.issue.id)).toEqual(["x", "y"]);
    expect(moves.every((m) => m.patch.status === "todo")).toBe(true);
    // Deux positions distinctes, strictement entre b (10) et c (20).
    const positions = moves.map((m) => m.patch.position);
    expect(positions[0]).toBeGreaterThan(10);
    expect(positions[0]).toBeLessThan(positions[1]);
    expect(positions[1]).toBeLessThan(20);
  });

  it("réordonne dans la colonne d'origine sans changer de statut", () => {
    const moves = planBoardMove({
      bundle: [todo[1], todo[2]], // b et c remontés en tête
      targetStatus: "todo",
      overIssueId: "a",
      columnItems: todo,
      manual: true,
      now: 0,
    });
    expect(moves.map((m) => m.patch.status)).toEqual([undefined, undefined]);
    const positions = moves.map((m) => m.patch.position);
    expect(positions[0]).toBeLessThan(positions[1]);
    expect(positions[1]).toBeLessThan(0); // avant a
  });

  it("ancre correctement quand la carte survolée fait partie du paquet", () => {
    // On lâche sur c, qui est glissé avec a : l'ancre utile est « après b ».
    const moves = planBoardMove({
      bundle: [todo[0], todo[2]],
      targetStatus: "todo",
      overIssueId: "c",
      columnItems: todo,
      manual: true,
      now: 0,
    });
    // Le seul ticket restant est b (10) : le paquet passe après lui.
    expect(moves.map((m) => m.patch.position)).toEqual([11, 12]);
  });
});

describe("tri par champ", () => {
  it("déplace le paquet en fin de colonne et laisse ceux qui y sont déjà", () => {
    const moves = planBoardMove({
      bundle: [todo[0], doing[0]],
      targetStatus: "todo",
      overIssueId: null,
      columnItems: todo,
      manual: false,
      now: 1000,
    });
    // a est déjà « À faire » : rien à écrire pour lui.
    expect(moves.map((m) => m.issue.id)).toEqual(["x"]);
    expect(moves[0].patch).toEqual({ status: "todo", position: 1000 });
  });

  it("n'écrit rien quand tout le paquet est déjà dans la colonne cible", () => {
    expect(
      planBoardMove({
        bundle: todo,
        targetStatus: "todo",
        overIssueId: "a",
        columnItems: todo,
        manual: false,
        now: 1000,
      })
    ).toEqual([]);
  });
});

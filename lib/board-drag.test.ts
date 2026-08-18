import { describe, expect, it } from "vitest";
import {
  dragBundle,
  displayRank,
  planBoardMove,
  previewBoardMove,
  readDropTarget,
  sameDropPreview,
} from "./board-drag";
import { issueComparator } from "./view-filter";
import type { Issue } from "./types";
import type { IssuePriority, IssueStatus } from "./issue-constants";

/** A ticket reduced to what the swipe looks like. */
function issue(id: string, status: IssueStatus, position: number): Issue {
  return { id, status, position } as Issue;
}

/** Same, plus the fields on which a column can be sorted. */
function sortable(
  id: string,
  status: IssueStatus,
  position: number,
  fields: { priority?: IssuePriority; due_date?: string | null }
): Issue {
  return { id, status, position, priority: "none", due_date: null, ...fields } as Issue;
}

/** The rectangle of a map, as dnd-kit gives it when dragging. */
function box(top: number, height = 100) {
  return { top, height };
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
      overIssueId: "c", // we let go on the 3rd card of “To do”
      columnItems: todo,
      manual: true,
      now: 0,
    });
    expect(moves.map((m) => m.issue.id)).toEqual(["x", "y"]);
    expect(moves.every((m) => m.patch.status === "todo")).toBe(true);
    // Two distinct positions, strictly between b (10) and c (20).
    const positions = moves.map((m) => m.patch.position);
    expect(positions[0]).toBeGreaterThan(10);
    expect(positions[0]).toBeLessThan(positions[1]);
    expect(positions[1]).toBeLessThan(20);
  });

  it("réordonne dans la colonne d'origine sans changer de statut", () => {
    const moves = planBoardMove({
      bundle: [todo[1], todo[2]], // b and c moved to the top
      targetStatus: "todo",
      overIssueId: "a",
      columnItems: todo,
      manual: true,
      now: 0,
    });
    expect(moves.map((m) => m.patch.status)).toEqual([undefined, undefined]);
    const positions = moves.map((m) => m.patch.position);
    expect(positions[0]).toBeLessThan(positions[1]);
    expect(positions[1]).toBeLessThan(0); // before a
  });

  it("ancre correctement quand la carte survolée fait partie du paquet", () => {
    // We let go of c, which is slipped with a: the useful anchor is “after b”.
    const moves = planBoardMove({
      bundle: [todo[0], todo[2]],
      targetStatus: "todo",
      overIssueId: "c",
      columnItems: todo,
      manual: true,
      now: 0,
    });
    // The only remaining ticket is b (10): the packet goes after it.
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
    // a is already “To do”: nothing to write for him.
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

describe("de quel côté de la carte survolée", () => {
  const byIdRects = new Map([...todo, ...doing].map((i) => [i.id, i]));

  it("lit le fond d'une colonne comme la colonne elle-même", () => {
    expect(
      readDropTarget({
        overId: "in_progress",
        overRect: box(0, 800),
        activeRect: box(300),
        issueById: byIdRects,
      })
    ).toEqual({ status: "in_progress", overIssueId: null, after: false });
  });

  it("insère AVANT quand la carte tenue est plus haut que la survolée", () => {
    const target = readDropTarget({
      overId: "b",
      overRect: box(200),
      activeRect: box(160),
      issueById: byIdRects,
    });
    expect(target).toEqual({ status: "todo", overIssueId: "b", after: false });
  });

  it("insère APRÈS quand elle est plus bas — sinon la fin d'une colonne est inatteignable", () => {
    const target = readDropTarget({
      overId: "c",
      overRect: box(400),
      activeRect: box(460),
      issueById: byIdRects,
    });
    expect(target).toEqual({ status: "todo", overIssueId: "c", after: true });
  });

  it("ne désigne rien sur une cible inconnue", () => {
    expect(
      readDropTarget({
        overId: "supprimé",
        overRect: box(0),
        activeRect: box(0),
        issueById: byIdRects,
      })
    ).toBeNull();
    expect(
      readDropTarget({
        overId: null,
        overRect: null,
        activeRect: null,
        issueById: byIdRects,
      })
    ).toBeNull();
  });

  it("pose le paquet APRÈS la dernière carte quand le dépôt vise sa moitié basse", () => {
    const moves = planBoardMove({
      bundle: [doing[0]],
      targetStatus: "todo",
      overIssueId: "c",
      dropAfter: true,
      columnItems: todo,
      manual: true,
      now: 0,
    });
    // c is 20 and has no next: the packet goes to 21, not before it.
    expect(moves[0].patch.position).toBe(21);
  });
});

describe("le repère de dépôt", () => {
  const manual = issueComparator("manual");

  function preview(moves: ReturnType<typeof planBoardMove>, items: Issue[], cmp = manual) {
    return previewBoardMove({ moves, displayItems: items, comparator: cmp });
  }

  it("s'ancre sur la carte devant laquelle le paquet se posera", () => {
    const moves = planBoardMove({
      bundle: [doing[0]],
      targetStatus: "todo",
      overIssueId: "b",
      columnItems: todo,
      manual: true,
      now: 0,
    });
    expect(preview(moves, todo)).toEqual({
      status: "todo",
      beforeIssueId: "b",
      count: 1,
    });
  });

  it("passe en fin de colonne quand rien ne suit le point de chute", () => {
    const moves = planBoardMove({
      bundle: [doing[0]],
      targetStatus: "todo",
      overIssueId: "c",
      dropAfter: true,
      columnItems: todo,
      manual: true,
      now: 0,
    });
    expect(preview(moves, todo)).toEqual({
      status: "todo",
      beforeIssueId: null,
      count: 1,
    });
  });

  it("compte le paquet et s'ancre sur une carte QUI RESTE", () => {
    // a and c are dragged together and dropped on c: b is the only fixed reference,
    // and the packet goes after it — so at the end of the column.
    const moves = planBoardMove({
      bundle: [todo[0], todo[2]],
      targetStatus: "todo",
      overIssueId: "c",
      columnItems: todo,
      manual: true,
      now: 0,
    });
    expect(preview(moves, todo)).toEqual({
      status: "todo",
      beforeIssueId: null,
      count: 2,
    });
  });

  it("ne montre rien quand le dépôt n'écrirait rien", () => {
    expect(preview([], todo)).toBeNull();
  });

  // The contract of the entire recovery: what the line announces is what
  // product writing. So we really apply the patches, we replay the sorting,
  // and we reread the neighbor.
  it("annonce l'arrivée que l'écriture produit vraiment", () => {
    for (const [overIssueId, dropAfter] of [
      ["a", false],
      ["a", true],
      ["b", false],
      ["b", true],
      ["c", true],
      [null, false],
    ] as const) {
      const moves = planBoardMove({
        bundle: [doing[1]], // y, dragged from “in progress”
        targetStatus: "todo",
        overIssueId,
        dropAfter,
        columnItems: todo,
        manual: true,
        now: 0,
      });
      const p = preview(moves, todo);
      const landed = todo
        .concat(moves.map((m) => ({ ...m.issue, ...m.patch }) as Issue))
        .sort(manual);
      const at = landed.findIndex((i) => i.id === "y");
      expect([overIssueId, dropAfter, landed[at + 1]?.id ?? null]).toEqual([
        overIssueId,
        dropAfter,
        p?.beforeIssueId ?? null,
      ]);
    }
  });

  // The heart of the recovery: in a column sorted by field, the card does not fall
  // NOT under the cursor. The marker should say where the sort will put it.
  it("suit le tri par priorité, pas le curseur", () => {
    const byPriority = issueComparator("priority");
    const column = [
      sortable("urgent", "todo", 0, { priority: "urgent" }),
      sortable("moyen", "todo", 10, { priority: "medium" }),
      sortable("bas", "todo", 20, { priority: "low" }),
    ];
    const dragged = sortable("neuf", "in_progress", 5, { priority: "high" });
    // Dropped at the bottom of the column, on the last card.
    const moves = planBoardMove({
      bundle: [dragged],
      targetStatus: "todo",
      overIssueId: "bas",
      dropAfter: true,
      columnItems: column,
      manual: false,
      now: 1_700_000_000_000,
    });
    // Sorting places it between “urgent” and “medium”: that’s where the line goes.
    expect(preview(moves, column, byPriority)).toEqual({
      status: "todo",
      beforeIssueId: "moyen",
      count: 1,
    });
  });

  it("suit le tri par échéance, les tickets sans date restant en queue", () => {
    const byDue = issueComparator("due");
    const column = [
      sortable("lundi", "todo", 0, { due_date: "2026-03-02" }),
      sortable("vendredi", "todo", 10, { due_date: "2026-03-06" }),
      sortable("sans date", "todo", 20, { due_date: null }),
    ];
    const dragged = sortable("mercredi", "in_progress", 0, {
      due_date: "2026-03-04",
    });
    const moves = planBoardMove({
      bundle: [dragged],
      targetStatus: "todo",
      overIssueId: "lundi",
      columnItems: column,
      manual: false,
      now: 1_700_000_000_000,
    });
    expect(preview(moves, column, byDue)).toEqual({
      status: "todo",
      beforeIssueId: "vendredi",
      count: 1,
    });
  });

  it("ne montre rien pour un réordonnancement impossible (colonne triée par champ)", () => {
    const byPriority = issueComparator("priority");
    const column = [
      sortable("un", "todo", 0, { priority: "high" }),
      sortable("deux", "todo", 10, { priority: "low" }),
    ];
    const moves = planBoardMove({
      bundle: [column[1]],
      targetStatus: "todo",
      overIssueId: "un",
      columnItems: column,
      manual: false,
      now: 1_700_000_000_000,
    });
    expect(preview(moves, column, byPriority)).toBeNull();
  });
});

describe("l'égalité de deux repères", () => {
  const p = { status: "todo" as IssueStatus, beforeIssueId: "b", count: 1 };

  it("ne re-rend pas le board pour un repère identique", () => {
    expect(sameDropPreview(p, { ...p })).toBe(true);
    expect(sameDropPreview(null, null)).toBe(true);
  });

  it("voit chaque champ", () => {
    expect(sameDropPreview(p, { ...p, beforeIssueId: "c" })).toBe(false);
    expect(sameDropPreview(p, { ...p, count: 2 })).toBe(false);
    expect(sameDropPreview(p, { ...p, status: "done" })).toBe(false);
    expect(sameDropPreview(p, null)).toBe(false);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  applyPendingBoard,
  applyPendingIssues,
  issueWrites,
  objectiveWrites,
} from "./issue-writes";
import type { GlobalBoardResponse, Issue, Objective } from "../types";

// Les registres sont des singletons partagés par toute l'application : une
// entrée laissée ouverte fausserait le test suivant.
afterEach(() => {
  issueWrites.reset();
  objectiveWrites.reset();
});

const issue = (id: string, projectId: string): Issue =>
  ({ id, project_id: projectId, status: "todo" }) as Issue;

const objective = (id: string, projectId: string, name: string): Objective =>
  ({ id, project_id: projectId, name, status: "planned" }) as Objective;

const board = (
  issues: Issue[],
  objectives: Record<string, Objective[]>
): GlobalBoardResponse => ({ issues, objectives }) as GlobalBoardResponse;

describe("applyPendingIssues", () => {
  // Le registre ne connaît pas le projet de la liste qu'on lui présente : sans
  // rescopage, une création encore en vol dans un projet s'ajoutait à la
  // réponse d'un autre (préchargement au survol, refetch temps réel…).
  it("n'ajoute pas la création en vol d'un autre projet", () => {
    const startedAt = Date.now();
    issueWrites.begin({ kind: "insert", row: issue("new", "A") });

    expect(
      applyPendingIssues([issue("b1", "B")], startedAt, "B").map((i) => i.id)
    ).toEqual(["b1"]);
    expect(
      applyPendingIssues([issue("a1", "A")], startedAt, "A").map((i) => i.id)
    ).toEqual(["a1", "new"]);
  });

  // Un patch désigne un ticket par son id : il ne peut pas se tromper de liste,
  // et le rescopage ne doit pas lui coûter l'identité du tableau (react-query
  // réutilise la référence quand rien n'a bougé).
  it("laisse le tableau intact quand aucune écriture ne s'applique", () => {
    const rows = [issue("b1", "B")];
    expect(applyPendingIssues(rows, Date.now(), "B")).toBe(rows);
  });
});

describe("applyPendingBoard", () => {
  // Le board cross-projet porte SA copie des objectifs : une réponse partie
  // avant le PATCH y rejouait l'ancien nom sur les puces des cartes de /all.
  it("superpose aussi les écritures d'objectif, projet par projet", () => {
    const startedAt = Date.now();
    objectiveWrites.begin({
      kind: "patch",
      id: "o1",
      patch: { name: "Refonte" },
    });

    const untouched = [objective("o2", "B", "Autre")];
    const payload = board([], { A: [objective("o1", "A", "Avant")], B: untouched });
    const next = applyPendingBoard(payload, startedAt);

    expect(next.objectives.A[0].name).toBe("Refonte");
    // Le projet que rien ne touche garde son tableau — react-query réutilise la
    // référence quand elle n'a pas bougé.
    expect(next.objectives.B).toBe(untouched);
  });

  it("rend la charge d'origine quand rien n'est en attente", () => {
    const payload = board([issue("a1", "A")], { A: [objective("o1", "A", "Avant")] });
    expect(applyPendingBoard(payload, Date.now())).toBe(payload);
  });
});

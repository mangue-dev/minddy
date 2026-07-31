import { describe, expect, it } from "vitest";
import { issueStatusForPrState } from "./issue-status-sync";

// La règle PURE qui aligne le statut d'un ticket sur l'état de sa PR (MIN-46,
// corrigée par MIN-138 pour le brouillon). L'écriture en base (`applyIssueStatus`)
// n'est pas testable en node (server-only).

describe("issueStatusForPrState", () => {
  it("une PR ouverte met le ticket en revue", () => {
    expect(issueStatusForPrState("open")).toBe("in_review");
  });

  it("une PR BROUILLON laisse le ticket en cours — elle n'est pas à relire", () => {
    // C'est la correction de MIN-138 : le brouillon renvoyait `in_review`, ce qui
    // faisait apparaître en file de relecture un travail que personne n'a proposé.
    expect(issueStatusForPrState("draft")).toBe("in_progress");
  });

  it("une PR fusionnée termine le ticket", () => {
    expect(issueStatusForPrState("merged")).toBe("done");
  });

  it("une PR refusée renvoie le ticket à faire, jamais annulé", () => {
    expect(issueStatusForPrState("closed")).toBe("todo");
  });

  it("un état absent n'implique aucun statut", () => {
    expect(issueStatusForPrState(null)).toBeNull();
  });
});

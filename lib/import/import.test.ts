import { describe, expect, it } from "vitest";
import { mapCsvToIssues } from "@/lib/import/parse";
import { parseDateValue } from "@/lib/import/normalize";

const LINEAR_CSV = `ID,Team,Title,Description,Status,Estimate,Priority,Creator,Assignee,Labels,Created,Completed,Due Date,Parent issue
ENG-1,ENG,Fix login on Safari,"Broken since v2.
Repro: open ""/login"".",In Progress,2,Urgent,alice,,Bug,2026-01-05T10:00:00.000Z,,2026-02-01,
ENG-2,ENG,Ship dark mode,,Done,3,Medium,alice,,"Feature, UI",2026-01-02T08:00:00.000Z,2026-01-20T18:30:00.000Z,,
ENG-3,ENG,Login sub-task,,Blocked,,No priority,alice,,,2026-01-06T10:00:00.000Z,,,ENG-1
ENG-4,ENG,Deep nested task,,Todo,,Low,alice,,,2026-01-07T10:00:00.000Z,,,ENG-3
ENG-5,ENG,Orphan child,,Todo,,High,alice,,,2026-01-08T10:00:00.000Z,,,ENG-99
`;

describe("Linear import", () => {
  const result = mapCsvToIssues(LINEAR_CSV);
  if (!result.ok) throw new Error("expected ok");

  it("detects the Linear source", () => {
    expect(result.source).toBe("linear");
  });

  it("maps fields, quoted descriptions, estimates and labels", () => {
    const [first, second] = result.issues;
    expect(first.title).toBe("Fix login on Safari");
    expect(first.description).toContain('open "/login"');
    expect(first.status).toBe("in_progress");
    expect(first.priority).toBe("urgent");
    expect(first.effort).toBe("s");
    expect(first.labels).toEqual(["Bug"]);
    expect(first.dueDate).toBe("2026-02-01");
    expect(first.createdAt).toBe("2026-01-05T10:00:00.000Z");

    expect(second.status).toBe("done");
    expect(second.completedAt).toBe("2026-01-20T18:30:00.000Z");
    expect(second.labels).toEqual(["Feature", "UI"]);
    expect(second.effort).toBe("m");
  });

  it("falls back to backlog on unknown statuses, with a warning", () => {
    const sub = result.issues[2];
    expect(sub.status).toBe("backlog");
    expect(result.warnings).toContainEqual({
      key: "unknownStatus",
      value: "Blocked",
      count: 1,
    });
  });

  it("keeps one nesting level and drops missing parents", () => {
    expect(result.issues[2].parentExternalKey).toBe("ENG-1");
    // ENG-4's parent ENG-3 is itself a sub-issue → flattened.
    expect(result.issues[3].parentExternalKey).toBeNull();
    // ENG-5's parent is not in the file → dropped.
    expect(result.issues[4].parentExternalKey).toBeNull();
    expect(result.warnings).toContainEqual({
      key: "flattenedSubIssue",
      value: undefined,
      count: 1,
    });
    expect(result.warnings).toContainEqual({
      key: "parentNotFound",
      value: undefined,
      count: 1,
    });
  });
});

const JIRA_CSV = `Summary,Issue key,Issue id,Issue Type,Status,Priority,Resolution,Created,Resolved,Due date,Labels,Labels,Custom field (Story Points),Parent id
Fix payment flow,PAY-1,10001,Story,Done,Highest,Won't Do,14/Jul/25 3:42 PM,15/Jul/25 9:00 AM,,backend,urgent-fix,5,
Checkout API,PAY-2,10002,Story,In Review,Medium,,14/Jul/25 10:00 AM,,20/Aug/25,api,,2,
Sub task,PAY-3,10003,Sub-task,To Do,Low,,15/Jul/25 11:05 AM,,,,,,10002
`;

describe("Jira import", () => {
  const result = mapCsvToIssues(JIRA_CSV);
  if (!result.ok) throw new Error("expected ok");

  it("detects the Jira source", () => {
    expect(result.source).toBe("jira");
  });

  it("collects repeated Labels columns and story points", () => {
    const [first, second] = result.issues;
    expect(first.labels).toEqual(["backend", "urgent-fix"]);
    expect(first.effort).toBe("l");
    expect(second.effort).toBe("s");
  });

  it("overrides a done status with the Won't Do resolution", () => {
    expect(result.issues[0].status).toBe("canceled");
    expect(result.issues[0].priority).toBe("urgent");
  });

  it("parses dd/MMM/yy dates", () => {
    expect(result.issues[0].createdAt).toBe("2025-07-14T15:42:00.000Z");
    expect(result.issues[1].dueDate).toBe("2025-08-20T00:00:00.000Z");
  });

  it("links sub-tasks through the numeric Parent id", () => {
    expect(result.issues[2].parentExternalKey).toBe("10002");
    expect(result.issues[2].externalKeys).toEqual(["PAY-3", "10003"]);
  });
});

// Semicolon-delimited, French headers with accents — papaparse auto-detects
// the delimiter, normalizeToken strips the accents.
const GENERIC_FR_CSV = `Titre;Description;Statut;Priorité;Effort;Étiquettes;Échéance
Refonte du tableau de bord;Nouvelle grille;À faire;Haute;m;design, front;2026-09-01
Bug affichage mobile;;En cours;Urgente;xs;bug;
;Ligne sans titre;Backlog;;;;
Statut exotique;;Bizarre;Basse;;;
`;

describe("generic CSV import (FR)", () => {
  const result = mapCsvToIssues(GENERIC_FR_CSV);
  if (!result.ok) throw new Error("expected ok");

  it("detects the generic source with French headers", () => {
    expect(result.source).toBe("csv");
    expect(result.issues).toHaveLength(3);
  });

  it("maps accented French values", () => {
    const [first, second] = result.issues;
    expect(first.status).toBe("todo");
    expect(first.priority).toBe("high");
    expect(first.effort).toBe("m");
    expect(first.labels).toEqual(["design", "front"]);
    expect(first.dueDate).toBe("2026-09-01");
    expect(second.status).toBe("in_progress");
    expect(second.priority).toBe("urgent");
  });

  it("skips rows without a title and warns on unknown statuses", () => {
    expect(result.warnings).toContainEqual({
      key: "skippedNoTitle",
      value: undefined,
      count: 1,
    });
    expect(result.warnings).toContainEqual({
      key: "unknownStatus",
      value: "Bizarre",
      count: 1,
    });
  });
});

// MIN-98 — les deux outils que l'onboarding documente sans leur donner de
// mapper : Trello (export natif du tableau) et GitHub (CSV écrit par `gh`).
// Tous deux passent par le mapper générique ; ces tests sont là pour que la
// marche à suivre de l'étape d'import reste vraie.

const TRELLO_CSV = `Card ID,Card Name,Card Description,List Name,Labels,Due Date
6a1,Refonte de la page d'accueil,"Maquette Figma prête",Doing,"design, marketing",2026-09-30
6a2,Corriger le lien du pied de page,,Done,bug,
6a3,Écrire les CGU,"À relire",To Do,,
6a4,Étudier la concurrence,,Idées,,
`;

const GITHUB_CSV = `id,title,description,status,labels,closed at
41,Crash on empty query,"Stack trace attached",OPEN,"bug;p1",
42,Document the CSV import,,CLOSED,docs,2026-05-04T09:12:00.000Z
`;

describe("Trello / GitHub exports", () => {
  it("reads a Trello board export as a generic CSV", () => {
    const result = mapCsvToIssues(TRELLO_CSV);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.source).toBe("csv");
    expect(result.issues).toHaveLength(4);

    const [first, second, third, fourth] = result.issues;
    expect(first.title).toBe("Refonte de la page d'accueil");
    expect(first.description).toBe("Maquette Figma prête");
    // Les noms de listes Trello courants sont déjà des alias de statut.
    expect(first.status).toBe("in_progress");
    expect(first.labels).toEqual(["design", "marketing"]);
    expect(first.dueDate).toBe("2026-09-30");
    expect(first.externalKeys).toEqual(["6a1"]);
    expect(second.status).toBe("done");
    expect(third.status).toBe("todo");

    // Une liste maison retombe sur backlog, avec l'avertissement qui le dit.
    expect(fourth.status).toBe("backlog");
    expect(result.warnings).toContainEqual({
      key: "unknownStatus",
      value: "Idées",
      count: 1,
    });
  });

  it("reads the CSV a `gh issue list` command writes", () => {
    const result = mapCsvToIssues(GITHUB_CSV);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.source).toBe("csv");
    const [open, closed] = result.issues;
    expect(open.status).toBe("todo");
    expect(open.labels).toEqual(["bug", "p1"]);
    expect(open.completedAt).toBeNull();
    expect(closed.status).toBe("done");
    expect(closed.completedAt).toBe("2026-05-04T09:12:00.000Z");
    expect(closed.externalKeys).toEqual(["42"]);
    expect(result.warnings).toEqual([]);
  });
});

describe("edge cases", () => {
  it("rejects empty or header-only files", () => {
    expect(mapCsvToIssues("")).toEqual({ ok: false, error: "empty" });
    expect(mapCsvToIssues("Title,Status\n")).toEqual({ ok: false, error: "empty" });
  });

  it("rejects files without a recognizable title column", () => {
    expect(mapCsvToIssues("Foo,Bar\n1,2\n")).toEqual({
      ok: false,
      error: "noTitleColumn",
    });
  });

  it("rejects imports above the issue cap", () => {
    const rows = Array.from({ length: 1001 }, (_, i) => `Issue ${i}`).join("\n");
    expect(mapCsvToIssues(`Title\n${rows}\n`)).toEqual({
      ok: false,
      error: "tooManyIssues",
    });
  });

  it("strips a BOM before parsing", () => {
    const result = mapCsvToIssues("\uFEFFTitle,Status\nHello,Done\n");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.issues[0].status).toBe("done");
  });
});

describe("parseDateValue", () => {
  it("passes ISO dates through and normalizes ISO datetimes", () => {
    expect(parseDateValue("2026-02-01")).toBe("2026-02-01");
    expect(parseDateValue("2026-02-01 10:30")).toBe("2026-02-01T10:30");
  });

  it("drops garbage instead of guessing", () => {
    expect(parseDateValue("not a date")).toBeNull();
    expect(parseDateValue("")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  buildIssuesCsv,
  EXPORT_HEADERS,
  exportFileName,
  type ExportIssueRow,
} from "@/lib/export/issues-csv";
import { mapCsvToIssues, prepareImport } from "@/lib/import/parse";
import { mappingHasGaps } from "@/lib/import/mapping";
import type { ImportContext } from "@/lib/import/types";

const row = (over: Partial<ExportIssueRow> = {}): ExportIssueRow => ({
  identifier: "MIN-1",
  title: "Fix login on Safari",
  description: "Broken since v2.",
  status: "in_progress",
  priority: "urgent",
  effort: "s",
  labels: ["Bug"],
  assignee: "Marie Dupont",
  objective: "Q3 stability",
  project: "minddy",
  dueDate: "2026-02-01",
  createdAt: "2026-01-05T10:00:00.000Z",
  completedAt: null,
  parent: null,
  ...over,
});

describe("issues CSV export", () => {
  it("writes the header row, in the documented order", () => {
    const csv = buildIssuesCsv([]);
    expect(csv).toBe(`﻿${EXPORT_HEADERS.join(",")}\r\n`);
    expect(EXPORT_HEADERS[0]).toBe("ID");
  });

  it("quotes only what needs it, and doubles inner quotes", () => {
    const csv = buildIssuesCsv([
      row({
        title: 'The "login" screen, at last',
        description: "Line one\nLine two",
        labels: ["Bug", "UI"],
      }),
    ]);
    const body = csv.split("\r\n")[1];
    expect(body).toContain('"The ""login"" screen, at last"');
    expect(body).toContain('"Line one\nLine two"');
    // Les étiquettes sont jointes par « , » : la cellule est donc citée.
    expect(body).toContain('"Bug, UI"');
    // Une valeur sans virgule, guillemet ni retour ligne reste nue.
    expect(body).toContain(",in_progress,urgent,s,");
  });

  it("names the file after the project it covers", () => {
    expect(exportFileName("MIN", "2026-08-04")).toBe("minddy-issues-min-2026-08-04.csv");
    expect(exportFileName(null, "2026-08-04")).toBe("minddy-issues-2026-08-04.csv");
  });
});

// ── L'aller-retour : ce qui sort de minddy y rentre ──────────────────────────

const TEAM: ImportContext = {
  actorId: "u-marie",
  categories: ["Bug"],
  members: [{ userId: "u-marie", email: "marie@corp.com", name: "Marie Dupont" }],
};

const EXPORTED = buildIssuesCsv([
  row(),
  row({
    identifier: "MIN-2",
    title: "Ship dark mode",
    description: null,
    status: "done",
    priority: "none",
    effort: null,
    labels: [],
    assignee: null,
    objective: null,
    dueDate: null,
    createdAt: "2026-01-02T08:00:00.000Z",
    completedAt: "2026-01-20T18:30:00.000Z",
  }),
  row({
    identifier: "MIN-3",
    title: "Login sub-task",
    description: null,
    status: "backlog",
    priority: "low",
    effort: null,
    labels: [],
    assignee: null,
    objective: null,
    dueDate: null,
    parent: "MIN-1",
  }),
]);

describe("minddy export, read back by minddy", () => {
  const result = mapCsvToIssues(EXPORTED, undefined, TEAM);
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);

  it("recognises its own format", () => {
    expect(result.source).toBe("minddy");
  });

  it("restores every field it wrote, warning about nothing", () => {
    const [first, second, third] = result.issues;
    expect(first.title).toBe("Fix login on Safari");
    expect(first.description).toBe("Broken since v2.");
    expect(first.status).toBe("in_progress");
    expect(first.priority).toBe("urgent");
    expect(first.effort).toBe("s");
    expect(first.labels).toEqual(["Bug"]);
    expect(first.assigneeId).toBe("u-marie");
    expect(first.dueDate).toBe("2026-02-01");
    expect(first.createdAt).toBe("2026-01-05T10:00:00.000Z");
    expect(first.externalKeys).toEqual(["MIN-1"]);

    // « none » est une priorité, pas une valeur intraduisible.
    expect(second.priority).toBe("none");
    expect(second.status).toBe("done");
    expect(second.completedAt).toBe("2026-01-20T18:30:00.000Z");
    expect(second.effort).toBeNull();

    expect(third.parentExternalKey).toBe("MIN-1");
    expect(result.warnings).toEqual([]);
  });

  it("does not carry the departure project's context into the arrival one", () => {
    // `Project` et `Objective` sont écrits, jamais relus : sans ça, le nom du
    // projet de départ finirait en catégorie ou en bas des descriptions.
    for (const issue of result.issues) {
      expect(issue.labels).not.toContain("minddy");
      expect(issue.description ?? "").not.toContain("Q3 stability");
    }
  });

  it("asks nothing of the model, except to place the people it doesn't know", () => {
    const known = prepareImport(EXPORTED, TEAM);
    if (!known.ok) throw new Error("expected ok");
    expect(mappingHasGaps(known.stats, known.mapping, known.source)).toBe(false);

    // Un export venu d'un AUTRE espace de travail : les colonnes restent les
    // nôtres, mais « Marie Dupont » n'est membre de rien ici — la seule chose
    // qui vaille encore un appel au modèle.
    const strangers = prepareImport(EXPORTED);
    if (!strangers.ok) throw new Error("expected ok");
    expect(mappingHasGaps(strangers.stats, strangers.mapping, strangers.source)).toBe(true);
  });
});

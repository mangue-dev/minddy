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
    // Labels are joined by “,”: the cell is therefore cited.
    expect(body).toContain('"Bug, UI"');
    // A value without commas, quotes or newlines remains bare.
    expect(body).toContain(",in_progress,urgent,s,");
  });

  it("neutralises a cell a spreadsheet would run as a formula", () => {
    // The content comes from a ticket title, therefore from any member of the
    // project: without this apostrophe, opening a colleague's export executes this
    // that he wrote (MIN-348).
    const csv = buildIssuesCsv([
      row({ title: '=HYPERLINK("http://evil","cliquez")', description: "- une puce" }),
    ]);
    const body = csv.split("\r\n")[1];
    expect(body).toContain(`"'=HYPERLINK(""http://evil"",""cliquez"")"`);
    // `-`, `+`, `@`, tab and carriage return follow the same rule.
    expect(body).toContain(`"'- une puce"`);

    for (const lead of ["+1", "@SUM(A1)", "\tcaché", "\rcaché"]) {
      const cell = buildIssuesCsv([row({ title: lead })]).split("\r\n")[1];
      expect(cell).toContain(`"'${lead}"`);
    }
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

    // “none” is a priority, not an untranslatable value.
    expect(second.priority).toBe("none");
    expect(second.status).toBe("done");
    expect(second.completedAt).toBe("2026-01-20T18:30:00.000Z");
    expect(second.effort).toBeNull();

    expect(third.parentExternalKey).toBe("MIN-1");
    expect(result.warnings).toEqual([]);
  });

  it("gives back the text, not the apostrophe that protected it", () => {
    // The anti-formula escape must not survive the round trip: one
    // description that starts with a markdown bullet returns as is.
    const csv = buildIssuesCsv([row({ title: "=1+1", description: "- une puce" })]);
    const read = mapCsvToIssues(csv, undefined, TEAM);
    if (!read.ok) throw new Error(`expected ok, got ${read.error}`);
    expect(read.issues[0].title).toBe("=1+1");
    expect(read.issues[0].description).toBe("- une puce");
  });

  it("does not carry the departure project's context into the arrival one", () => {
    // `Project` and `Objective` are written, never read again: otherwise, the name of the
    // starting project would end up in category or at the bottom of the descriptions.
    for (const issue of result.issues) {
      expect(issue.labels).not.toContain("minddy");
      expect(issue.description ?? "").not.toContain("Q3 stability");
    }
  });

  it("asks nothing of the model, except to place the people it doesn't know", () => {
    const known = prepareImport(EXPORTED, TEAM);
    if (!known.ok) throw new Error("expected ok");
    expect(mappingHasGaps(known.stats, known.mapping, known.source)).toBe(false);

    // An export from ANOTHER workspace: the columns remain the
    // ours, but “Marie Dupont” is not a member of anything here — the only thing
    // which is still worth a call to the model.
    const strangers = prepareImport(EXPORTED);
    if (!strangers.ok) throw new Error("expected ok");
    expect(mappingHasGaps(strangers.stats, strangers.mapping, strangers.source)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { issuesFromMapping, mapCsvToIssues, prepareImport } from "@/lib/import/parse";
import {
  fieldsAvailableForColumn,
  mappingHasGaps,
  mergeMapping,
  sanitizeMapping,
} from "@/lib/import/mapping";
import {
  EMPTY_IMPORT_CONTEXT,
  MAX_IMPORT_ISSUES,
  MULTI_COLUMN_FIELDS,
  type ImportContext,
  type ImportField,
  type ImportMapping,
} from "@/lib/import/types";
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

// MIN-98 — the two tools that onboarding documents without giving them any
// map: Trello (native table export) and GitHub (CSV written by `gh`).
// Both pass through the generic mapper; these tests are there so that the
// procedure of the import step remains true.

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
    // Common Trello list names are already status aliases.
    expect(first.status).toBe("in_progress");
    expect(first.labels).toEqual(["design", "marketing"]);
    expect(first.dueDate).toBe("2026-09-30");
    expect(first.externalKeys).toEqual(["6a1"]);
    expect(second.status).toBe("done");
    expect(third.status).toBe("todo");

    // A homemade list falls back on backlog, with the warning that says so.
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
    const rows = Array.from({ length: MAX_IMPORT_ISSUES + 1 }, (_, i) => `Issue ${i}`);
    expect(mapCsvToIssues(`Title\n${rows.join("\n")}\n`)).toEqual({
      ok: false,
      error: "tooManyIssues",
    });
  });

  it("takes a file of a few thousand rows without breaking a sweat", () => {
    // The ceiling is a safeguard, not a technical limit: since the
    // columns are only counted once, preparing a large file is a
    // just one swipe — and that's what the preview does again with each edit.
    const header = "Title,Status,Priority,Assignee,Labels,Sprint";
    const rows = Array.from(
      { length: 3000 },
      (_, i) =>
        `Issue ${i},${i % 2 ? "In Progress" : "Done"},${i % 3 ? "High" : "Low"},` +
        `person${i % 7}@corp.com,"bug, ui",S-${i % 12}`
    );
    const started = performance.now();
    const result = prepareImport(`${header}\n${rows.join("\n")}\n`);
    if (!result.ok) throw new Error(result.error);
    const { issues } = issuesFromMapping(result.table, result.mapping);
    const elapsed = performance.now() - started;

    expect(issues).toHaveLength(3000);
    expect(result.stats[3].distinctCount).toBe(7); // the 7 people, counted once
    // Wide, but it would break if a column scan came back.
    expect(elapsed).toBeLessThan(2000);
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

  // Notion writes its dates in full, in the language of space
  // work, and a “Date” property can carry a range.
  it("reads Notion's spelled-out dates, in French too", () => {
    expect(parseDateValue("July 14, 2026")).toBe("2026-07-14T00:00:00.000Z");
    expect(parseDateValue("14 juillet 2026")).toBe("2026-07-14T00:00:00.000Z");
    expect(parseDateValue("3 février 2026")).toBe("2026-02-03T00:00:00.000Z");
  });

  it("keeps the start of a date range", () => {
    expect(parseDateValue("14 juillet 2026 → 20 juillet 2026")).toBe(
      "2026-07-14T00:00:00.000Z"
    );
    expect(parseDateValue("2026-02-01 → 2026-02-08")).toBe("2026-02-01");
  });
});

// ── Notion ───────────────────────────────────────────────────────────────────
// A Notion database export: the columns are the properties that
// the user has created, here those of the “Tasks” model in French. Two
// singularities that do not exist anywhere else: no column
// identifier, and a parent referenced BY HIS TITLE.

const NOTION_CSV = `Nom de la tâche,Statut,Priorité,Étiquettes,Date d'échéance,Élément parent,Responsable
Refondre l'onboarding,Pas commencé,Haute,"produit, UX",14 juillet 2026,,Marie Dupont
Écrire les nouveaux textes,En cours,Moyenne,contenu,,Refondre l'onboarding,Ali Ben
Migrer la base,Terminé,Basse,,,,Marie Dupont
Nettoyer les vieux comptes,Bloqué,,infra,,,
`;

describe("Notion export", () => {
  const result = mapCsvToIssues(NOTION_CSV);
  if (!result.ok) throw new Error("expected ok");

  it("reads the French property names of Notion's task template", () => {
    const [first] = result.issues;
    expect(result.issues).toHaveLength(4);
    expect(first.title).toBe("Refondre l'onboarding");
    expect(first.status).toBe("todo"); // “Not started”
    expect(first.priority).toBe("high");
    expect(first.labels).toEqual(["produit", "UX"]);
    expect(first.dueDate).toBe("2026-07-14T00:00:00.000Z");
    expect(result.issues[2].status).toBe("done");
  });

  it("links a sub-task through the parent's TITLE, for want of an id", () => {
    // Without an identifier column, the title takes its place: this is the only way
    // to link "Parent Element", which has the title of the parent.
    expect(result.issues[1].parentExternalKey).toBe("Refondre l'onboarding");
    expect(result.issues[0].externalKeys).toEqual(["Refondre l'onboarding"]);
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ key: "parentNotFound" })
    );
  });

  it("leaves a genuinely ambiguous status to the user, and says so", () => {
    // minddy does not have a “blocked” status: we don’t guess it, we report it.
    expect(result.issues[3].status).toBe("backlog");
    expect(result.warnings).toContainEqual({
      key: "unknownStatus",
      value: "Bloqué",
      count: 1,
    });
  });

  it("ignores a column it has no field for, until someone places it", () => {
    // “Responsible” is not aliased anywhere: header detection
    // leaves aside, and it is the pass of the model (or the table of
    // correspondence) who recovers it — cf. the extra testNote below.
    const { table, stats, mapping } = prepared(NOTION_CSV);
    expect(mapping.columns[table.headers.indexOf("Responsable")]).toBe("assignee");
    // Without a corresponding member, the person remains to be placed.
    expect(mapping.assigneeValues).toEqual({});
    expect(mappingHasGaps(stats, mapping)).toBe(true);
  });
});

// ── The reading plan ─────────────────────────── ────────────────────────────

function prepared(csv: string) {
  const result = prepareImport(csv);
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result;
}

describe("import mapping", () => {
  it("recovers an orphan column as categories or as a description note", () => {
    const { table, mapping } = prepared(NOTION_CSV);
    const at = (header: string) => table.headers.indexOf(header);

    // What the model pass offers on this file: few values
    // distinct and repeated → categories; a person → note.
    const columns = [...mapping.columns];
    columns[at("Responsable")] = "extraNote";
    columns[at("Étiquettes")] = "labels";

    const { issues } = issuesFromMapping(table, { ...mapping, columns });
    // No original description → no separating line at the top.
    expect(issues[0].description).toBe("Responsable : Marie Dupont");
    expect(issues[3].description).toBeNull(); // empty column → nothing added

    columns[at("Responsable")] = "extraLabels";
    const asLabels = issuesFromMapping(table, { ...mapping, columns });
    expect(asLabels.issues[0].labels).toEqual(["produit", "UX", "Marie Dupont"]);
  });

  it("appends the note under the description that was already there", () => {
    const csv = `Title,Description,Sprint\nFix the login,Broken since v2,S-42\n`;
    const { table, mapping } = prepared(csv);
    const columns = [...mapping.columns];
    columns[table.headers.indexOf("Sprint")] = "extraNote";

    const { issues } = issuesFromMapping(table, { ...mapping, columns });
    expect(issues[0].description).toBe("Broken since v2\n\n---\nSprint : S-42");
  });

  /**
   * A simple field is only offered once, because `applyMapping` does not read
   * THAT the first column: the second would be text lost in silence. This
   * The following verifies both halves of this statement — the list of
   * exceptions, and the fact that it really describes the behavior of the mapper.
   */
  it("offers a simple field only to the column that holds it", () => {
    const csv = `Title,Description,Sprint\nA,B,S-1\n`;
    const { table, mapping } = prepared(csv);
    const at = (header: string) => table.headers.indexOf(header);
    expect(mapping.columns[at("Title")]).toBe("title");
    expect(mapping.columns[at("Sprint")]).toBe("ignore");

    // The orphan column can become many things — but not one
    // second title nor a second description.
    const forOrphan = fieldsAvailableForColumn(mapping.columns, at("Sprint"));
    expect(forOrphan).not.toContain("title");
    expect(forOrphan).not.toContain("description");
    // Fields with several columns remain available.
    expect(forOrphan).toEqual(expect.arrayContaining([...MULTI_COLUMN_FIELDS]));

    // And the column that CARRYS the field keeps it in its own list, otherwise
    // its selector would appear empty.
    expect(fieldsAvailableForColumn(mapping.columns, at("Title"))).toContain("title");
  });

  it("does not hand a simple field to two columns at detection time either", () => {
    // “Description” and “Notes” are two aliases of the SAME field, and this file
    // has both. Assigning them both was like throwing “Notes” away without
    // say nothing; orphaned, the column once again becomes a question that we ask.
    const { table, mapping } = prepared(
      `Title,Description,Notes\nFix the login,Broken since v2,Reported by Ada\n`
    );
    const at = (header: string) => table.headers.indexOf(header);
    expect(mapping.columns[at("Description")]).toBe("description");
    expect(mapping.columns[at("Notes")]).toBe("ignore");

    // Nothing is lost however: reported in a note, the column reappears in
    // bottom of the description — that's exactly what the table suggests.
    const columns = [...mapping.columns];
    columns[at("Notes")] = "extraNote";
    const { issues } = issuesFromMapping(table, { ...mapping, columns });
    expect(issues[0].description).toBe(
      "Broken since v2\n\n---\nNotes : Reported by Ada"
    );
  });

  it("still lets Jira repeat the columns that are meant to repeat", () => {
    // Two “Labels” and the two format identifiers: the field rule
    // unique ne doit surtout pas y toucher.
    const csv =
      `Issue key,Issue id,Summary,Status,Labels,Labels\n` +
      `PROJ-12,10042,Fix the login,Done,bug,ui\n`;
    const { mapping, source } = prepared(csv);
    expect(source).toBe("jira");
    expect(mapping.columns.filter((f) => f === "externalKey")).toHaveLength(2);
    expect(mapping.columns.filter((f) => f === "labels")).toHaveLength(2);
  });

  it("keeps a duplicate the detection already produced, without adding more", () => {
    // Two columns with the same name: both aim for status. We do not erase this
    // which is there — but no THIRD column can be added to it.
    const columns: ImportField[] = ["title", "status", "status", "ignore"];
    expect(fieldsAvailableForColumn(columns, 1)).toContain("status");
    expect(fieldsAvailableForColumn(columns, 2)).toContain("status");
    expect(fieldsAvailableForColumn(columns, 3)).not.toContain("status");
  });

  it("only exempts fields the row mapper actually reads more than once", () => {
    // The safeguard of the rule: two columns on a SIMPLE field, and the
    // second does not exist for `applyMapping`. If one day it mattered, it's
    // here that we would learn it — and `MULTI_COLUMN_FIELDS` should welcome it.
    const csv = `Title,Description,Details\nFix the login,Broken since v2,Second body\n`;
    const { table, mapping } = prepared(csv);
    const columns = [...mapping.columns];
    columns[table.headers.indexOf("Details")] = "description";

    const { issues } = issuesFromMapping(table, { ...mapping, columns });
    expect(issues[0].description).toBe("Broken since v2");
    expect(MULTI_COLUMN_FIELDS.has("description")).toBe(false);

    // Two ID columns, conversely, both count —
    // it's a Jira export, and "Parent" references it one OR the other.
    const bothKeys = [...mapping.columns];
    bothKeys[table.headers.indexOf("Details")] = "externalKey";
    bothKeys[table.headers.indexOf("Description")] = "externalKey";
    const keyed = issuesFromMapping(table, { ...mapping, columns: bothKeys });
    expect(keyed.issues[0].externalKeys).toEqual(["Broken since v2", "Second body"]);
    expect(MULTI_COLUMN_FIELDS.has("externalKey")).toBe(true);
  });

  it("lets a hand-placed value beat the alias tables", () => {
    const { table, mapping } = prepared(NOTION_CSV);
    const { issues } = issuesFromMapping(table, {
      ...mapping,
      statusValues: { ...mapping.statusValues, bloque: "in_progress" },
    });
    expect(issues[3].status).toBe("in_progress");
  });

  it("reads efforts written in words", () => {
    const csv = `Title,Taille\nRefonte,Large\nPetit correctif,Small\nAutre,3\n`;
    const { table, mapping } = prepared(csv);
    const { issues } = issuesFromMapping(table, mapping);
    expect(issues.map((i) => i.effort)).toEqual(["l", "s", "m"]);
  });

  it("asks nothing of the model when the headers already say everything", () => {
    // A complete Linear export: each column is placed, each value
    // translated. Calling a model to confirm it wouldn't yield anything.
    const clean = `ID,Title,Description,Status,Priority,Labels,Created,Completed,Due Date,Parent issue,Estimate
ENG-1,Fix login,,In Progress,Urgent,Bug,2026-01-05,,2026-02-01,,2
`;
    const { stats, mapping, source } = prepared(clean);
    expect(source).toBe("linear");
    expect(mappingHasGaps(stats, mapping)).toBe(false);
  });
});

// ── Return the tickets to their owners ─────────────────────────────────

const TEAM: ImportContext = {
  actorId: "u-marie",
  categories: ["Bug", "Design", "Infra"],
  members: [
    { userId: "u-marie", email: "marie.dupont@corp.com", name: "Marie Dupont" },
    { userId: "u-ali", email: "ali.ben@corp.com", name: "Ali Ben" },
  ],
};

const TEAM_CSV = `Title,Assignee,Labels
Refonte de l'onboarding,marie.dupont@corp.com,bugs
Corriger le pied de page,"Dupont, Marie",Design
Migrer la base,Ali Ben,infra
Écrire la doc,Someone Else,rédaction
Nettoyer les comptes,,
`;

describe("people and categories", () => {
  const result = prepareImport(TEAM_CSV, TEAM);
  if (!result.ok) throw new Error(result.error);

  it("recognises a member by e-mail, by name, and by reversed name", () => {
    const { issues } = issuesFromMapping(result.table, result.mapping);
    expect(issues[0].assigneeId).toBe("u-marie"); // par e-mail
    expect(issues[1].assigneeId).toBe("u-marie"); // « Dupont, Marie »
    expect(issues[2].assigneeId).toBe("u-ali"); // par nom d'affichage
    expect(issues[4].assigneeId).toBeNull(); // colonne vide
  });

  it("keeps an unknown person in the description rather than dropping them", () => {
    const { issues, warnings } = issuesFromMapping(result.table, result.mapping);
    expect(issues[3].assigneeId).toBeNull();
    expect(issues[3].description).toBe("Assignee : Someone Else");
    expect(warnings).toContainEqual({
      key: "unknownAssignee",
      value: "Someone Else",
      count: 1,
    });
  });

  it("lands a label on the category the project already has", () => {
    const { issues } = issuesFromMapping(result.table, result.mapping);
    // “bugs” → the existing “Bug” category, not a twin in the plural;
    // “Design” and “infra” → their category, case correct.
    expect(issues[0].labels).toEqual(["Bug"]);
    expect(issues[1].labels).toEqual(["Design"]);
    expect(issues[2].labels).toEqual(["Infra"]);
    // What the project does not have remains as is: it will be created.
    expect(issues[3].labels).toEqual(["rédaction"]);
  });

  it("assigns nobody when the project has no members to match", () => {
    const alone = prepareImport(TEAM_CSV);
    if (!alone.ok) throw new Error(alone.error);
    const { issues } = issuesFromMapping(alone.table, alone.mapping);
    expect(issues.every((i) => i.assigneeId === null)).toBe(true);
    // And nothing is lost yet.
    expect(issues[0].description).toBe("Assignee : marie.dupont@corp.com");
  });

  it("refuses an assignee who is not a member of the project", () => {
    // The plan comes from the browser: an arbitrary identifier must not
    // be able to assign a ticket to someone outside the project.
    const forged = {
      ...result.mapping,
      assigneeValues: { "someone else": "u-intruder", "ali ben": "u-ali" },
    };
    const server = mapCsvToIssues(TEAM_CSV, forged, TEAM);
    if (!server.ok) throw new Error("expected ok");
    expect(server.issues[3].assigneeId).toBeNull();
    expect(server.issues[2].assigneeId).toBe("u-ali");
  });

  it("drops a label the user chose not to import", () => {
    const { issues } = issuesFromMapping(result.table, {
      ...result.mapping,
      labelValues: { ...result.mapping.labelValues, redaction: "" },
    });
    expect(issues[3].labels).toEqual([]);
  });
});

describe("sanitizeMapping", () => {
  const { table } = prepared(NOTION_CSV);
  const columnCount = table.headers.length;

  it("drops fields and enum values it does not know", () => {
    const clean = sanitizeMapping(columnCount, EMPTY_IMPORT_CONTEXT, {
      columns: ["title", "nonsense", "status"],
      statusValues: { "pas commence": "todo", bizarre: "shipped" },
      priorityValues: { haute: "high" },
      effortValues: null,
    });
    expect(clean?.columns).toEqual([
      "title",
      "ignore",
      "status",
      "ignore",
      "ignore",
      "ignore",
      "ignore",
    ]);
    expect(clean?.statusValues).toEqual({ "pas commence": "todo" });
    expect(clean?.priorityValues).toEqual({ haute: "high" });
    expect(clean?.effortValues).toEqual({});
  });

  it("always spans the columns of the file the SERVER re-read", () => {
    // A clip longer than the file cannot overflow, a clip shorter
    // ne laisse pas de trous.
    const long = sanitizeMapping(2, EMPTY_IMPORT_CONTEXT, {
      columns: Array.from({ length: 40 }, () => "title"),
    });
    expect(long?.columns).toHaveLength(2);
  });

  it("refuses what is not a plan at all", () => {
    expect(sanitizeMapping(3, EMPTY_IMPORT_CONTEXT, null)).toBeNull();
    expect(sanitizeMapping(3, EMPTY_IMPORT_CONTEXT, { columns: "title" })).toBeNull();
  });
});

describe("mergeMapping", () => {
  const base: ImportMapping = {
    columns: ["title", "ignore", "status"],
    statusValues: { done: "done" },
    priorityValues: {},
    effortValues: {},
    assigneeValues: {},
    labelValues: {},
  };
  const empty = { statusValues: {}, priorityValues: {}, effortValues: {},
    assigneeValues: {}, labelValues: {} };

  it("only fills the gaps of a known export", () => {
    const merged = mergeMapping(
      { ...base, columns: [...base.columns] },
      { ...empty, columns: ["description", "extraNote", "priority"],
        statusValues: { done: "canceled", bloque: "todo" } },
      { columnsWin: false }
    );
    expect(merged.columns).toEqual(["title", "extraNote", "status"]);
    // What the aliases knew how to translate is never overwritten.
    expect(merged.statusValues).toEqual({ done: "done", bloque: "todo" });
  });

  it("lets the model re-place the columns of a plain CSV", () => {
    const merged = mergeMapping(
      { ...base, columns: [...base.columns] },
      { ...empty, columns: ["extraNote", "title", "status"] },
      { columnsWin: true }
    );
    expect(merged.columns).toEqual(["extraNote", "title", "status"]);
  });

  it("keeps the detected columns when the proposal loses the title", () => {
    const merged = mergeMapping(
      { ...base, columns: [...base.columns] },
      { ...empty, columns: ["description", "ignore", "status"] },
      { columnsWin: true }
    );
    expect(merged.columns).toEqual(["title", "ignore", "status"]);
  });
});

describe("a mapping travels to the server and back", () => {
  it("replays the user's corrections on the raw file", () => {
    // What the commit does: the server rereads the CSV and replays the plan that
    // the preview showed. The result should be that of the preview, not that of
    // detection.
    const { table, mapping } = prepared(NOTION_CSV);
    const columns = [...mapping.columns];
    columns[table.headers.indexOf("Responsable")] = "extraLabels";

    const server = mapCsvToIssues(NOTION_CSV, { ...mapping, columns });
    expect(server.ok).toBe(true);
    if (!server.ok) return;
    expect(server.issues[0].labels).toContain("Marie Dupont");
  });

  it("refuses a plan that designates no title", () => {
    const { mapping } = prepared(NOTION_CSV);
    const columns = mapping.columns.map(() => "ignore" as const);
    expect(mapCsvToIssues(NOTION_CSV, { ...mapping, columns })).toEqual({
      ok: false,
      error: "noTitleColumn",
    });
  });
});

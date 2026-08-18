// The row mapper — the ONLY one. Linear, Jira, Trello, Notion, an in-house CSV:
// all arrive here in the same form, a `ImportMapping` which tells where each one goes
// column and what each value amounts to. What distinguishes a source from a
// other lives entirely in the construction of the plan (`lib/import/mapping.ts`),
// never in reading lines.
//
// Corollary: what the preview lookup table modifies are
// the same levers as those for automatic detection. There is not one
// “detected” path and a “hand-corrected” path — one way, two ways
// write the plan.

import type { IssueEffortValue, IssueStatusValue } from "@/lib/issue-validation";
import type { ImportedIssue, ImportField, ImportMapping } from "@/lib/import/types";
import {
  cell,
  cells,
  effortFromPoints,
  MAX_TITLE_LENGTH,
  normalizeToken,
  parseDateValue,
  splitLabels,
  Warnings,
  type CsvTable,
} from "@/lib/import/normalize";

/** Jira resolutions that reclassify a “Done” status (`resolution` column). */
const RESOLUTION_OVERRIDES: Record<string, "canceled" | "duplicate"> = {
  "wont do": "canceled",
  "wont fix": "canceled",
  wontfix: "canceled",
  declined: "canceled",
  "cannot reproduce": "canceled",
  "cant reproduce": "canceled",
  duplicate: "duplicate",
};

/** What a column reported as a note adds to the bottom of the description. */
const NOTE_SEPARATOR = "\n\n---\n";

export function applyMapping(
  table: CsvTable,
  mapping: ImportMapping,
  warnings: Warnings
): ImportedIssue[] {
  const at = (field: ImportField) =>
    mapping.columns.flatMap((f, i) => (f === field ? [i] : []));

  const cols = {
    title: at("title"),
    description: at("description"),
    status: at("status"),
    priority: at("priority"),
    effort: at("effort"),
    labels: at("labels"),
    assignee: at("assignee"),
    dueDate: at("dueDate"),
    createdAt: at("createdAt"),
    completedAt: at("completedAt"),
    externalKey: at("externalKey"),
    parent: at("parent"),
    resolution: at("resolution"),
    extraLabels: at("extraLabels"),
    extraNote: at("extraNote"),
  };
  /** The header under which to report an assignment that we were unable to recognize. */
  const assigneeHeader = cols.assignee.map((i) => table.headers[i])[0] ?? "";

  const issues: ImportedIssue[] = [];

  for (const row of table.rows) {
    const title = cell(row, cols.title).slice(0, MAX_TITLE_LENGTH);
    if (!title) {
      warnings.add("skippedNoTitle");
      continue;
    }

    // ── Status: the plan dictionary is authentic. A value that he does not carry
    // not is a value that no one (alias, model, user) knew
    // place: backlog, and we say it. ──
    const rawStatus = cell(row, cols.status);
    let status: IssueStatusValue = "backlog";
    if (rawStatus) {
      const mapped = mapping.statusValues[normalizeToken(rawStatus)];
      if (mapped) status = mapped;
      else warnings.add("unknownStatus", rawStatus);
    }

    const resolution = RESOLUTION_OVERRIDES[normalizeToken(cell(row, cols.resolution))];
    if (status === "done" && resolution) status = resolution;

    const rawPriority = normalizeToken(cell(row, cols.priority));
    const priority = mapping.priorityValues[rawPriority] ?? "none";

    // Effort : jeton connu du plan (xs…xl, « Small », « Moyen »), sinon points.
    const rawEffort = cell(row, cols.effort);
    const effort: IssueEffortValue | null = rawEffort
      ? (mapping.effortValues[normalizeToken(rawEffort)] ?? effortFromPoints(rawEffort))
      : null;

    // Labels: the label columns, plus the orphan columns we have
    // chose to transform into categories. Each one goes through the dictionary,
    // which brings it back to an EXISTING category of the project when there is one —
    // this is what avoids creating “Bugs” next to the “Bug” already there. A
    // empty entry discards the label. Deduplication after reconciliation: two
    // file labels can refer to the same category.
    const labels: string[] = [];
    const seenLabels = new Set<string>();
    for (const value of [
      ...cells(row, cols.labels),
      ...cells(row, cols.extraLabels),
    ]) {
      for (const label of splitLabels(value)) {
        const mapped = mapping.labelValues[normalizeToken(label)];
        const name = mapped === undefined ? label : mapped;
        if (!name) continue;
        const key = name.toLowerCase();
        if (seenLabels.has(key)) continue;
        seenLabels.add(key);
        labels.push(name);
      }
    }

    // ── Assigned: the file names someone, the project has members. ──
    // Recognized, the ticket is his. Not recognized, it remains unassigned but the
    // name goes down in the description: we do not delete fault information
    // to know where to store it.
    let assigneeId: string | null = null;
    const rawAssignee = cell(row, cols.assignee);
    if (rawAssignee) {
      assigneeId = mapping.assigneeValues[normalizeToken(rawAssignee)] ?? null;
      if (!assigneeId) warnings.add("unknownAssignee", rawAssignee);
    }

    // Columns without fields in minddy, reported at the bottom of the description:
    // “Header: value”, one per line. The label is that of the file —
    // this is the user's data, it is not translated.
    const notes = cols.extraNote
      .map((i) => {
        const value = (row[i] ?? "").trim();
        return value ? `${table.headers[i]} : ${value}` : "";
      })
      .filter(Boolean);
    // A person with no limbs ends up there — losing the name would be
    // worse than putting it in the description.
    if (rawAssignee && !assigneeId) {
      notes.push(`${assigneeHeader || "Assignee"} : ${rawAssignee}`);
    }

    // The separation line only separates if there is something above it:
    // a line without a description begins directly with its notes.
    const body = cell(row, cols.description);
    const description =
      notes.length === 0
        ? body
        : body
          ? `${body}${NOTE_SEPARATOR}${notes.join("\n")}`
          : notes.join("\n");

    // Without an identifier column, the title TAKES PLACE: that's how a
    // export Notion links its subtasks, its “Parent Element” column carrying
    // the title of the parent and not a key. When the file has real
    // identifiants, on n'y touche pas — deux tickets homonymes se confondraient.
    const keys = cells(row, cols.externalKey);
    const externalKeys = keys.length > 0 ? keys : [title];

    issues.push({
      title,
      description: description || null,
      status,
      priority,
      effort,
      labels,
      assigneeId,
      dueDate: parseDateValue(cell(row, cols.dueDate)),
      createdAt: parseDateValue(cell(row, cols.createdAt)),
      // Reread only for `done` tickets on insertion
      // (lib/server/import-issues.ts): a closing date on one more line
      // open has no effect.
      completedAt: parseDateValue(cell(row, cols.completedAt)),
      externalKeys,
      parentExternalKey: cell(row, cols.parent) || null,
    });
  }

  return issues;
}

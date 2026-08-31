/**
 * Registry of tools from which minddy can import a backlog (MIN-98). Like
 * `lib/mcp-agents.ts`, this module only stores locale-independent values: the
 * identifier, documentation URL, and optional command. The instructions live
 * in the i18n catalogs under `Onboarding.importGuide_<id>_1..3`.
 *
 * None of these tools have a dedicated mapper — except minddy, whose export is
 * minddy's format (`lib/import/minddy.ts`, paired with
 * `lib/export/issues-csv.ts`).
 * The others fall into the generic mapper (`lib/import/generic.ts`), including
 * column aliases that cover what these exports produce. Changing this list
 * without checking `lib/import/import.test.ts` risks documenting a broken path.
 *
 * Notion is the edge case that requires pattern-based matching: its columns are
 * user-created properties with arbitrary localized names. Aliases cover the
 * properties in Notion's templates; the model reads everything else
 * (`lib/server/import-mapping-ai.ts`), and the preview lets the user make the
 * final mapping decision.
 */

export type ImportGuideId =
  | "linear"
  | "jira"
  | "notion"
  | "github"
  | "trello"
  | "minddy";

export interface ImportGuide {
  id: ImportGuideId;
  /** Product name, never translated. */
  label: string;
  /** Official export documentation, open in a new tab.
 Absent for minddy: the procedure takes place HERE, and its only
 “elsewhere” would be `/llms-full.txt`, written for agents. */
  docUrl?: string;
  /** Tools without native CSV export: the command that creates one. */
  command?: string;
}

/** GitHub does not have a CSV export: `gh` writes the file, with headers that
 the generic mapper already recognizes (id, title, description, status, labels).
 `--state all` embeds closed issues — they arrive as "done". */
const GH_EXPORT_COMMAND = `gh issue list --state all --limit 1000 \\
  --json number,title,body,state,labels \\
  --jq '["id","title","description","status","labels"], (.[] | [.number, .title, .body, .state, ([.labels[].name] | join(";"))]) | @csv' > issues.csv`;

export const IMPORT_GUIDES: ImportGuide[] = [
  {
    id: "linear",
    label: "Linear",
    // The EXPORT page, not the import page: `import-issues` explains how
    // enter Linear, and its single mention of a CSV describes a template to
    // fill. Verified on 2026-08-04.
    docUrl: "https://linear.app/docs/exporting-data",
  },
  {
    id: "jira",
    label: "Jira",
    // The old URL (`jira-cloud-administration/docs/export-issues`) describes the
    // “Backup manager” and its XML backups — nothing to do with a CSV.
    // Verified on 2026-08-04.
    docUrl:
      "https://support.atlassian.com/jira/kb/how-to-export-issues-from-jira-cloud-in-csv-format/",
  },
  {
    id: "notion",
    label: "Notion",
    docUrl: "https://www.notion.com/help/export-your-content",
  },
  {
    id: "github",
    label: "GitHub",
    docUrl: "https://cli.github.com/manual/gh_issue_list",
    command: GH_EXPORT_COMMAND,
  },
  {
    id: "trello",
    label: "Trello",
    docUrl:
      "https://support.atlassian.com/trello/docs/exporting-data-from-trello/",
  },
  {
    // minddy itself: move a project or recover the backlog from a workspace.
    // Export (⌘K) writes the format that `lib/import/minddy.ts` reads column for
    // column, making this the only lossless round trip in the list.
    id: "minddy",
    label: "minddy",
  },
];

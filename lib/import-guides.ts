/**
 * Registry of tools from which we know how to output a backlog (MIN-98) — twin of
 * `lib/mcp-agents.ts`, and even sharing of roles: the module only carries this
 * which is not of the language (the id, the doc URL, the command to copy), the
 * labels and the three lines of procedure to follow live in the catalogs
 * i18n under `Onboarding.importGuide_<id>_1..3`.
 *
 * None of these tools have a dedicated mapper — except minddy, whose export is
 * OUR format (`lib/import/minddy.ts`, opposite `lib/export/issues-csv.ts`).
 * The others fall into the generic mapper (`lib/import/generic.ts`), including
 * column aliases cover exactly what these exports produce.
 * Touch this list without checking `lib/import/import.test.ts` would amount to
 * documenting a path that doesn't work.
 *
 * Notion is the edge case that justified the match pass by
 * pattern: its columns are the properties that the user created and named
 * himself, in his language. The aliases cover those of the models
 * provided by Notion; for everything else, it's the model that reads the values
 * (`lib/server/import-mapping-ai.ts`), and the lookup table of
 * the preview that leaves the last word.
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
  /** Nom du produit — jamais traduit. */
  label: string;
  /** Logo for light theme (public/); logoDark = dark theme variant.
 Satisfied `BrandMark` (`components/brand-logo.tsx`) without depending on it —
 `lib/` does not go back to the components, like `lib/mcp-agents.ts`. */
  logo: string;
  logoDark?: string;
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
    logo: "/import/linear.svg",
    // The EXPORT page, not the import page: `import-issues` explains how
    // enter Linear, and its single mention of a CSV describes a template to
    // fill. Verified on 2026-08-04.
    docUrl: "https://linear.app/docs/exporting-data",
  },
  {
    id: "jira",
    label: "Jira",
    logo: "/import/jira.svg",
    // The old URL (`jira-cloud-administration/docs/export-issues`) describes the
    // “Backup manager” and its XML backups — nothing to do with a CSV.
    // Verified on 2026-08-04.
    docUrl:
      "https://support.atlassian.com/jira/kb/how-to-export-issues-from-jira-cloud-in-csv-format/",
  },
  {
    id: "notion",
    // Monochrome brand like GitHub: the black “N” would disappear on a dark background.
    // Trace taken from `@lobehub/icons` (Notion/components/Mono), the source of
    // marks of `public/agents/` — the clear variant is the plot in #111, the
    // darken the same in #fff. Its `fill-rule="evenodd"` is not decorative:
    // without it the “N” is not cut out and the logo becomes a solid block.
    logo: "/import/notion-light.svg",
    logoDark: "/import/notion-dark.svg",
    label: "Notion",
    docUrl: "https://www.notion.com/help/export-your-content",
  },
  {
    id: "github",
    label: "GitHub",
    // Monochrome brand, like Codex or Windsurf: it would disappear on one
    // des deux fonds sans sa variante.
    logo: "/import/github-light.svg",
    logoDark: "/import/github-dark.svg",
    docUrl: "https://cli.github.com/manual/gh_issue_list",
    command: GH_EXPORT_COMMAND,
  },
  {
    id: "trello",
    label: "Trello",
    logo: "/import/trello.svg",
    docUrl:
      "https://support.atlassian.com/trello/docs/exporting-data-from-trello/",
  },
  {
    // minddy itself: move one project to another, or recover the
    // backlog of a space that we are leaving. Export (⌘K) writes the format that
    // `lib/import/minddy.ts` reads column for column — the only round trip
    // du lot qui ne perde rien de ce que minddy sait porter.
    id: "minddy",
    label: "minddy",
    // Monochrome brand, like GitHub and Notion: the brand logo is
    // served in two lines so as not to disappear on one of the two backgrounds.
    logo: "/import/minddy-light.svg",
    logoDark: "/import/minddy-dark.svg",
  },
];

/**
 * Le format CSV que minddy EXPORTE — la table des colonnes, l'écriture du
 * fichier, et la documentation qui s'en déduit.
 *
 * Trois surfaces lisent ce module, et c'est tout l'intérêt qu'il soit unique :
 *   • la route `GET /api/me/issues/export`, qui écrit le fichier ;
 *   • `/llms.txt` et `/llms-full.txt`, qui en publient le contrat — un agent qui
 *     reçoit un export minddy sait quelles colonnes il tient sans les deviner ;
 *   • `lib/import/minddy.ts`, dont la table d'alias reprend ces mêmes en-têtes,
 *     pour que le fichier RENTRE dans minddy aussi bien qu'il en sort.
 *
 * Le contrat est donc écrit une fois. Ajouter une colonne ici la fait apparaître
 * dans le fichier, dans la doc publiée et — si elle a un champ d'arrivée — dans
 * la relecture à l'import, au lieu des trois oublis habituels.
 *
 * Module pur (pas de `server-only`, aucun accès base) : testable, et donc
 * vérifiable contre l'import, ce qui est la seule garantie de l'aller-retour.
 */

import type {
  IssueEffortValue,
  IssuePriorityValue,
  IssueStatusValue,
} from "@/lib/issue-validation";

/** Une ligne à écrire — ce que la route a fini de résoudre (noms, identifiants). */
export interface ExportIssueRow {
  /** `<CLÉ PROJET>-<numéro>`, ex. MIN-42. */
  identifier: string;
  title: string;
  description: string | null;
  status: IssueStatusValue;
  priority: IssuePriorityValue;
  effort: IssueEffortValue | null;
  /** Noms des catégories du ticket. */
  labels: string[];
  /** Nom d'affichage de l'assigné, `null` si personne. */
  assignee: string | null;
  /** Nom de l'objectif, `null` si le ticket n'en a pas. */
  objective: string | null;
  /** Nom du projet — une portée « tous mes projets » mélange les lignes. */
  project: string;
  dueDate: string | null;
  createdAt: string | null;
  completedAt: string | null;
  /** Identifiant du parent (`MIN-40`), `null` au premier niveau. */
  parent: string | null;
}

export interface ExportColumn {
  /** L'en-tête tel qu'écrit dans le fichier. La relecture est insensible à la
   *  casse (`normalizeToken`), mais c'est cette forme-là qui fait foi. */
  header: string;
  /** Ce que la colonne porte, en anglais : cette phrase EST la doc publiée. */
  meaning: string;
  value: (row: ExportIssueRow) => string;
}

/** Le séparateur d'une cellule multi-valeurs. Aussi celui que `splitLabels`
 *  relit à l'import — changer l'un sans l'autre casserait l'aller-retour. */
const LABEL_SEPARATOR = ", ";

/**
 * Les colonnes, dans l'ordre du fichier. L'ordre est le même quelle que soit la
 * portée demandée : un export d'un seul projet porte quand même sa colonne
 * `Project`, pour qu'il n'y ait qu'un format à documenter et à relire.
 */
export const EXPORT_COLUMNS: ExportColumn[] = [
  {
    header: "ID",
    meaning:
      "Issue identifier, `<PROJECT KEY>-<number>` (e.g. MIN-42). What the Parent column points at.",
    value: (r) => r.identifier,
  },
  { header: "Title", meaning: "The issue title.", value: (r) => r.title },
  {
    header: "Description",
    meaning: "Markdown, often multi-line — the cell is quoted, newlines are kept.",
    value: (r) => r.description ?? "",
  },
  {
    header: "Status",
    meaning:
      "Raw value, never a translated label: triage, backlog, todo, in_progress, in_review, done, canceled or duplicate.",
    value: (r) => r.status,
  },
  {
    header: "Priority",
    meaning: "Raw value: none, urgent, high, medium or low.",
    value: (r) => r.priority,
  },
  {
    header: "Effort",
    meaning: "T-shirt size: xs, s, m, l, xl — empty when the issue carries none.",
    value: (r) => r.effort ?? "",
  },
  {
    header: "Labels",
    meaning: `The issue's categories, separated by "${LABEL_SEPARATOR.trim()} ".`,
    value: (r) => r.labels.join(LABEL_SEPARATOR),
  },
  {
    header: "Assignee",
    meaning:
      "Display name of the member the issue is assigned to; empty when unassigned.",
    value: (r) => r.assignee ?? "",
  },
  {
    header: "Objective",
    meaning:
      "Name of the objective grouping the issue; empty when it belongs to none.",
    value: (r) => r.objective ?? "",
  },
  {
    header: "Project",
    meaning:
      "Name of the project the issue belongs to — an export can span every project of the account.",
    value: (r) => r.project,
  },
  {
    header: "Due Date",
    meaning: "ISO 8601, empty when the issue has no due date.",
    value: (r) => r.dueDate ?? "",
  },
  { header: "Created", meaning: "ISO 8601 creation timestamp.", value: (r) => r.createdAt ?? "" },
  {
    header: "Completed",
    meaning: "ISO 8601 completion timestamp; only issues that reached done carry one.",
    value: (r) => r.completedAt ?? "",
  },
  {
    header: "Parent",
    meaning:
      "ID of the parent issue, empty at top level. minddy nests one level only, so a parent is never itself a sub-issue.",
    value: (r) => r.parent ?? "",
  },
];

/** Les en-têtes seuls — ce que la détection de source relit (`lib/import/minddy.ts`). */
export const EXPORT_HEADERS: string[] = EXPORT_COLUMNS.map((c) => c.header);

/**
 * Plafond d'un export. Bien au-dessus de `MAX_IMPORT_ISSUES` (5 000) : sortir
 * ses données ne doit pas être limité par ce qu'on sait ré-avaler d'un coup. Au
 * contact du plafond, la route le DIT (en-tête `X-Minddy-Truncated`) — un
 * fichier tronqué en silence est le pire des exports.
 */
export const MAX_EXPORT_ISSUES = 20000;

// ── Écriture ────────────────────────────────────────────────────────────────

/**
 * Les premiers caractères qui font d'une cellule une FORMULE à l'ouverture.
 *
 * Excel, LibreOffice et Google Sheets lisent `=`, `+`, `-` et `@` en tête de
 * cellule comme le début d'un calcul — et une formule s'exécute à l'ouverture
 * du fichier, sans que personne ait cliqué. Une tabulation ou un retour chariot
 * les rejoignent : ils sont mangés au parsing, et c'est le caractère suivant qui
 * se retrouve en tête.
 *
 * Le contenu vient d'un titre ou d'une description de ticket, donc de
 * n'importe qui ayant accès au projet : `=HYPERLINK(...)` dans un titre suffit à
 * transformer l'export d'un collègue en piège (MIN-348).
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * L'apostrophe qui neutralise une formule. C'est la convention des tableurs
 * eux-mêmes : ils l'écrivent à l'export et la mangent à la lecture, et
 * `lib/import/normalize.ts` fait pareil — c'est ce qui garde l'aller-retour
 * intact sur une description qui commence par une puce markdown.
 */
export const FORMULA_GUARD = "'";

/** RFC 4180 : on ne met des guillemets que s'il en faut, et on double les siens.
    Une cellule qu'un tableur lirait comme une formule est neutralisée d'abord,
    et se retrouve donc toujours entre guillemets. */
function csvCell(value: string): string {
  const safe = FORMULA_LEAD.test(value) ? `${FORMULA_GUARD}${value}` : value;
  if (!/[",\r\n]/.test(safe) && safe === value && safe === safe.trim()) return safe;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Le fichier complet, en-tête compris.
 *
 * CRLF et BOM ne sont pas de la coquetterie : ce sont les deux conditions pour
 * qu'Excel ouvre le fichier sans mutiler les accents ni recoller les lignes
 * d'une description. Notre propre lecteur les absorbe (`parseCsvTable` retire le
 * BOM, papaparse accepte les deux fins de ligne), donc l'aller-retour tient.
 */
export function buildIssuesCsv(rows: ExportIssueRow[]): string {
  const lines = [EXPORT_HEADERS.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(EXPORT_COLUMNS.map((c) => csvCell(c.value(row))).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/**
 * Le nom du fichier téléchargé. La clé du projet quand l'export n'en couvre
 * qu'un : c'est le seul mot qui distingue deux exports du même jour.
 */
export function exportFileName(projectKey: string | null, isoDate: string): string {
  const scope = projectKey ? `-${projectKey.toLowerCase()}` : "";
  return `minddy-issues${scope}-${isoDate}.csv`;
}

// ── Contrat publié ──────────────────────────────────────────────────────────

/** La route qui sert l'export, telle que la doc l'annonce. */
export const EXPORT_ISSUES_PATH = "/api/me/issues/export";

export interface IssuesCsvDoc {
  purpose: string;
  how: string;
  columns: { header: string; meaning: string }[];
  rules: string[];
  omits: string;
}

/**
 * Le contrat, en données — rendu par `/llms.txt` (les en-têtes) et
 * `/llms-full.txt` (colonne par colonne). Anglais, comme le reste de ce qui est
 * publié pour les agents.
 */
export function issuesCsvDoc(): IssuesCsvDoc {
  return {
    purpose:
      "Users can export their issues as CSV. This is the exact shape of the file " +
      "they get, so an agent handed one knows what it holds without guessing.",
    how:
      "In the app: ⌘K → “Export issues as CSV”, then pick the scope (one project " +
      "or every project) and which statuses to include. Over HTTP, as the signed-in " +
      `user: GET ${EXPORT_ISSUES_PATH}?project=<project id|all>&statuses=<comma-separated statuses>. ` +
      "Both parameters are optional and default to everything.",
    columns: EXPORT_COLUMNS.map(({ header, meaning }) => ({ header, meaning })),
    rules: [
      "RFC 4180: comma-separated, CRLF line endings, quotes doubled inside quoted cells.",
      "UTF-8 with a leading BOM, so spreadsheets read accents correctly.",
      "A cell starting with =, +, -, @, a tab or a carriage return is prefixed with a " +
        "single quote, the spreadsheet convention that keeps it text instead of a formula. " +
        "Strip that leading quote when reading the value back — minddy's own importer does.",
      "The header row is always present, and the columns always come in the order above — " +
        "an export scoped to a single project still carries the Project column.",
      "Rows are ordered by project, then by issue number ascending.",
      `At most ${MAX_EXPORT_ISSUES.toLocaleString("en-US")} rows; past that the response carries ` +
        "`X-Minddy-Truncated: true`.",
      "minddy reads this file back (project settings → Import): re-importing an export " +
        "restores titles, descriptions, statuses, priorities, efforts, categories, " +
        "assignees, dates and the parent/child links. Project and Objective are context " +
        "columns — they are written, never read back.",
    ],
    omits:
      "What the file does NOT carry: implementation plans, comments, attachments, " +
      "issue relations, cycle membership, recurrence cadence and the activity timeline. " +
      "Read those over MCP.",
  };
}

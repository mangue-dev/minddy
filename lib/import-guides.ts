/**
 * Registry des outils dont on sait faire sortir un backlog (MIN-98) — jumeau de
 * `lib/mcp-agents.ts`, et même partage des rôles : le module ne porte que ce
 * qui n'est pas de la langue (l'id, l'URL de doc, la commande à copier), les
 * libellés et les trois lignes de marche à suivre vivent dans les catalogues
 * i18n sous `Onboarding.importGuide_<id>_1..3`.
 *
 * Aucun de ces outils n'a de mapper dédié : leurs exports tombent dans le
 * mapper générique (`lib/import/generic.ts`), dont les alias de colonnes
 * couvrent exactement ce que ces exports produisent. Toucher à cette liste sans
 * vérifier `lib/import/import.test.ts` reviendrait à documenter un chemin qui
 * ne marche pas.
 */

export type ImportGuideId = "linear" | "jira" | "github" | "trello";

export interface ImportGuide {
  id: ImportGuideId;
  /** Nom du produit — jamais traduit. */
  label: string;
  /** Logo pour thème clair (public/) ; logoDark = variante thème sombre.
      Satisfait `BrandMark` (`components/brand-logo.tsx`) sans en dépendre —
      `lib/` ne remonte pas vers les composants, comme `lib/mcp-agents.ts`. */
  logo: string;
  logoDark?: string;
  /** Documentation officielle de l'export, ouverte dans un nouvel onglet. */
  docUrl: string;
  /** Outils sans export CSV natif : la commande qui en fabrique un. */
  command?: string;
}

/** GitHub n'a pas d'export CSV : `gh` écrit le fichier, avec des en-têtes que
    le mapper générique reconnaît déjà (id, title, description, status, labels).
    `--state all` embarque les issues fermées — elles arrivent en « done ». */
const GH_EXPORT_COMMAND = `gh issue list --state all --limit 1000 \\
  --json number,title,body,state,labels \\
  --jq '["id","title","description","status","labels"], (.[] | [.number, .title, .body, .state, ([.labels[].name] | join(";"))]) | @csv' > issues.csv`;

export const IMPORT_GUIDES: ImportGuide[] = [
  {
    id: "linear",
    label: "Linear",
    logo: "/import/linear.svg",
    docUrl: "https://linear.app/docs/import-issues",
  },
  {
    id: "jira",
    label: "Jira",
    logo: "/import/jira.svg",
    docUrl:
      "https://support.atlassian.com/jira-cloud-administration/docs/export-issues/",
  },
  {
    id: "github",
    label: "GitHub",
    // Marque monochrome, comme Codex ou Windsurf : elle disparaîtrait sur l'un
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
];

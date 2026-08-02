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
 *
 * Notion est le cas limite qui a justifié la passe de correspondance par
 * modèle : ses colonnes sont les propriétés que l'utilisateur a créées et
 * nommées lui-même, dans sa langue. Les alias couvrent celles des modèles
 * fournis par Notion ; pour tout le reste, c'est le modèle qui lit les valeurs
 * (`lib/server/import-mapping-ai.ts`), et le tableau de correspondance de
 * l'aperçu qui laisse le dernier mot.
 */

export type ImportGuideId = "linear" | "jira" | "notion" | "github" | "trello";

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
    id: "notion",
    // Marque monochrome comme GitHub : le « N » noir disparaîtrait sur fond sombre.
    logo: "/import/notion-light.svg",
    logoDark: "/import/notion-dark.svg",
    label: "Notion",
    docUrl: "https://www.notion.com/help/export-your-content",
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

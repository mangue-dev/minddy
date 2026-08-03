// Shared shapes for the CSV importers (Linear / Jira / generic). Isomorphic:
// the settings UI maps the file client-side for the instant preview, and the
// import route re-runs the exact same mapping server-side on commit.

import type {
  IssueEffortValue,
  IssuePriorityValue,
  IssueStatusValue,
} from "@/lib/issue-validation";

/** D'où vient le lot importé : un CSV téléversé, le backfill d'un dépôt lié à
 *  l'activation de la synchro d'issues (MIN-97), ou la découpe d'un brief à
 *  l'amorce d'un projet (MIN-172) — cette valeur est celle que porte
 *  l'événement `imported` de la timeline. */
export type ImportSource = "linear" | "jira" | "csv" | "github" | "gitlab" | "brief";

/**
 * Plafond par import — garde-fou contre un export raté qui inonderait un
 * projet, pas une limite technique : depuis que les numéros sont réservés en un
 * appel et les identifiants tirés côté serveur (`lib/server/import-issues.ts`),
 * le coût d'un import est en allers-retours par LOT, pas par ticket.
 * Le vrai plafond en pratique reste `MAX_IMPORT_CSV_BYTES`.
 */
export const MAX_IMPORT_ISSUES = 5000;

/** Raw CSV payload cap accepted by the route (and enforced client-side). */
export const MAX_IMPORT_CSV_BYTES = 5 * 1024 * 1024;

/** One issue as mapped from a CSV row, ready for bulk insert. */
export interface ImportedIssue {
  title: string;
  description: string | null;
  status: IssueStatusValue;
  priority: IssuePriorityValue;
  effort: IssueEffortValue | null;
  /** Label names — resolved to project categories (created on the fly). */
  labels: string[];
  /** Membre du projet à qui rendre le ticket, `null` si personne ne correspond. */
  assigneeId: string | null;
  /** ISO date or datetime. */
  dueDate: string | null;
  /** Original creation timestamp (ISO) — preserved on insert when present. */
  createdAt: string | null;
  /** Original completion timestamp (ISO) — only meaningful for done issues. */
  completedAt: string | null;
  /** Identifiers this row answers to (e.g. "ENG-42", a Jira numeric id). */
  externalKeys: string[];
  /** Parent reference (matched against other rows' externalKeys, 1 level max). */
  parentExternalKey: string | null;
  /**
   * Objectif d'arrivée — un id RÉEL, résolu par l'appelant avant l'écriture
   * (l'amorce par brief crée ses objectifs d'abord, MIN-172). Il voyage avec la
   * ligne plutôt qu'en seconde passe : `importIssuesIntoProject` tire les
   * identifiants lui-même et n'en rend aucun, donc rattacher après coup
   * demanderait de retrouver les tickets qu'on vient d'insérer. Absent d'un
   * import CSV, qui n'a pas d'objectif à donner.
   */
  objectiveId?: string | null;
  /** Identité de l'issue distante que ce ticket reflète (backfill d'un dépôt
   *  lié, MIN-97). Absent pour un import CSV. */
  remote?: {
    provider: string;
    repoId: string;
    number: number;
    url: string | null;
  };
}

// ── Mapping : le plan de lecture d'un fichier ────────────────────────────────

/**
 * Ce qu'une colonne du CSV alimente dans minddy. Un `ImportMapping` en porte
 * un par colonne, dans l'ordre du fichier : c'est le SEUL contrat entre la
 * détection par en-têtes, la proposition du modèle et le tableau modifiable de
 * l'aperçu. Le mapper de lignes (`lib/import/apply.ts`) ne connaît que ça.
 *
 * Plusieurs colonnes peuvent viser le même champ (Jira répète « Labels ») : la
 * première valeur non vide gagne pour les champs simples, toutes s'ajoutent
 * pour les champs de liste.
 *
 * `extraLabels` et `extraNote` sont le rattrapage des colonnes dont minddy n'a
 * pas le champ (assigné, sprint, epic, propriété Notion maison) : plutôt que de
 * les perdre, on en fait des catégories quand la colonne a peu de valeurs
 * distinctes, une ligne en bas de la description sinon.
 */
export type ImportField =
  | "ignore"
  | "title"
  | "description"
  | "status"
  | "priority"
  | "effort"
  | "labels"
  /** Qui s'en occupe — rapproché des membres du projet, cf. `lib/import/people.ts`. */
  | "assignee"
  | "dueDate"
  | "createdAt"
  | "completedAt"
  | "externalKey"
  | "parent"
  /** Jira : une résolution « Won't Do » requalifie un statut « Done ». */
  | "resolution"
  /** Colonne orpheline dont les valeurs deviennent des catégories. */
  | "extraLabels"
  /** Colonne orpheline reportée en bas de la description, « En-tête : valeur ». */
  | "extraNote";

/** Ordre d'affichage dans le sélecteur du tableau de correspondance. */
export const IMPORT_FIELDS: ImportField[] = [
  "ignore",
  "title",
  "description",
  "status",
  "priority",
  "effort",
  "labels",
  "assignee",
  "dueDate",
  "createdAt",
  "completedAt",
  "externalKey",
  "parent",
  "resolution",
  "extraLabels",
  "extraNote",
];

/** Table d'alias d'une source : les noms d'en-tête (normalisés) par champ, dans
 *  l'ordre de priorité — la première règle qui matche une colonne la prend. */
export type ColumnAliases = [ImportField, string[]][];

const IMPORT_FIELD_SET = new Set<string>(IMPORT_FIELDS);
export const isImportField = (value: unknown): value is ImportField =>
  typeof value === "string" && IMPORT_FIELD_SET.has(value);

/**
 * Le plan complet de lecture d'un fichier : où va chaque colonne, et à quoi se
 * ramène chaque valeur des colonnes à énumération.
 *
 * Les dictionnaires sont la source de vérité UNIQUE des valeurs — ils sont
 * pré-remplis par les tables d'alias (`normalize.ts`) à la construction du plan,
 * puis complétés par le modèle et modifiables à la main. Une valeur absente du
 * dictionnaire est une valeur que personne n'a su placer : le mapper la signale
 * plutôt que de la deviner. Les clés sont normalisées (`normalizeToken`).
 */
export interface ImportMapping {
  /** Un champ par colonne du fichier, dans l'ordre des en-têtes. */
  columns: ImportField[];
  statusValues: Record<string, IssueStatusValue>;
  priorityValues: Record<string, IssuePriorityValue>;
  /** Les effort chiffrés (story points) restent gérés par la conversion. */
  effortValues: Record<string, IssueEffortValue>;
  /**
   * Nom de personne du fichier → `user_id` d'un membre du projet. Absent = on
   * n'a reconnu personne : le ticket reste non assigné et le nom part en bas de
   * la description, pour que l'information ne disparaisse pas.
   */
  assigneeValues: Record<string, string>;
  /**
   * Étiquette du fichier → nom de catégorie à utiliser. Absent = on garde
   * l'étiquette telle quelle (créée si le projet ne l'a pas). Chaîne vide = on
   * ne la reprend pas. C'est ce qui évite de créer « Bugs » à côté du « Bug »
   * qui existe déjà.
   */
  labelValues: Record<string, string>;
}

/**
 * Ce que le projet d'arrivée apporte au rapprochement : ses membres (pour
 * rendre les tickets à leurs propriétaires) et ses catégories (pour ranger les
 * étiquettes importées dans celles qui existent plutôt que d'en créer des
 * jumelles). Sans ce contexte, un import ne peut que deviner.
 */
export interface ImportContext {
  members: ImportMember[];
  /** Noms des catégories déjà présentes dans le projet. */
  categories: string[];
  /** Celui qui importe — c'est SON backlog, et souvent son nom dans le fichier. */
  actorId: string;
}

export interface ImportMember {
  userId: string;
  email: string | null;
  name: string | null;
}

export const EMPTY_IMPORT_CONTEXT: ImportContext = {
  members: [],
  categories: [],
  actorId: "",
};

/** Warning kinds surfaced in the preview (and echoed by the commit response). */
export type ImportWarningKey =
  | "unknownStatus"
  | "skippedNoTitle"
  | "parentNotFound"
  | "flattenedSubIssue"
  /** Un nom de personne qui ne correspond à aucun membre : gardé en description. */
  | "unknownAssignee";

export interface ImportWarning {
  key: ImportWarningKey;
  /** Interpolated detail (e.g. the unrecognized status name). */
  value?: string;
  count: number;
}

export type ImportParseError = "empty" | "noTitleColumn" | "tooManyIssues";

export type ImportParseResult =
  | {
      ok: true;
      source: ImportSource;
      issues: ImportedIssue[];
      warnings: ImportWarning[];
      /** Le plan effectivement appliqué (détecté, ou celui reçu de l'appelant). */
      mapping: ImportMapping;
    }
  | { ok: false; error: ImportParseError };

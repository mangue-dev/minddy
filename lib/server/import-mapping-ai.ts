import "server-only";

import { getAppConfigValues } from "@/lib/server/app-config";
import { aiModelFallback } from "@/lib/ai-model-config";
import { modelConfigKeys, resolveFromValues } from "@/lib/server/model-config";
import { forcedToolCall } from "@/lib/server/feedback/forced-tool-call";
import {
  ISSUE_EFFORTS,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  isEffort,
  isPriority,
  isStatus,
  type IssueEffortValue,
  type IssuePriorityValue,
  type IssueStatusValue,
} from "@/lib/issue-validation";
import { normalizeToken } from "@/lib/import/normalize";
import {
  IMPORT_FIELDS,
  isImportField,
  type ImportField,
  type ImportMapping,
  type ImportMember,
} from "@/lib/import/types";
import { renderDigest, type CsvDigest } from "@/lib/import/digest";

/**
 * La passe de correspondance d'un import (MIN-45 suite) : un PETIT modèle lit
 * le résumé du fichier — en-têtes, nombre de valeurs distinctes, échantillons —
 * et rend un plan de lecture.
 *
 * Pourquoi un modèle là où des tables d'alias existaient déjà : les alias ne
 * connaissent que des NOMS. Ils savent lire « Status », pas « Niveau
 * d'avancement » ; ils savent traduire « In Progress », pas « Bloqué » ni
 * « Sprint 3 terminé ». Tout ce qu'ils ne reconnaissaient pas tombait
 * silencieusement — colonne ignorée, statut ramené à backlog, priorité perdue.
 * Un appel de quelques milliers de tokens PAR FICHIER (jamais par ligne) rend
 * cette part-là de l'import, et c'est la moins chère à récupérer.
 *
 * Ce que le modèle rend n'est qu'une PROPOSITION : elle est fusionnée avec le
 * plan déduit des en-têtes, affichée dans le tableau de correspondance de
 * l'aperçu, et modifiable avant de valider. Un échec (clé absente, timeout,
 * JSON invalide) rend `null` et l'import se fait comme avant.
 *
 * Le contenu du fichier est de la DONNÉE à étiqueter, jamais des consignes : la
 * sortie forcée borne ce qu'une ligne malveillante peut obtenir à un mauvais
 * plan, que l'utilisateur voit à l'écran avant que quoi que ce soit ne soit écrit.
 */

/** Clé `app_config` du modèle qui propose les correspondances. */
export const IMPORT_MAP_MODEL_KEY = "import_map_model";
/** Clé `app_config` de l'interrupteur global de la passe. */
export const IMPORT_MAP_ENABLED_KEY = "import_map_enabled";

/** Un plan de 60 colonnes et de leurs valeurs tient largement dedans. */
const MAX_OUTPUT_TOKENS = 4096;

const FIELD_DOC = `- title: the issue's name. EXACTLY ONE column. Mandatory — always assign one.
- description: the issue's body / details / notes.
- status: where the issue stands (a workflow state, a Kanban column, a Notion "Status").
- priority: how urgent it is.
- effort: how big it is (t-shirt size, story points, "Small"/"Large").
- labels: tags / categories, possibly several per cell.
- assignee: WHO is responsible — the one person the issue belongs to. Values are
  names or e-mails. Pick the column that means "assigned to", not "created by"
  / "reporter" / "last edited by": minddy has a field for the former only.
- dueDate / createdAt / completedAt: dates.
- externalKey: the row's own identifier (ENG-42, 10001, a card id).
- parent: the identifier OR the title of another row, for sub-issues.
- resolution: Jira's resolution field only ("Won't Do", "Duplicate"…).
- extraLabels: a column minddy has NO field for, whose values are short and
  repeat across rows — a type, a component, a team, an epic, a sprint, an area.
  Its values become categories, so the issues stay searchable by it.
- extraNote: a column minddy has NO field for, whose values are long, unique per
  row, or personal — a reporter, a URL, an estimate in hours, a free-text
  comment. Its values are appended at the bottom of the description as
  "Header : value", so nothing is lost.
- ignore: the column carries nothing worth keeping — an always-empty column, an
  internal id nobody reads, a duplicate of a column you already mapped, a
  timestamp minddy has no use for (last edited, sync date).`;

const SYSTEM_PROMPT = `You map a CSV export of an issue tracker onto minddy's own fields, so that importing loses as little as possible.

You are given, for each column: its index, its header, how many distinct values it holds, and its most frequent values. TRUST THE VALUES OVER THE HEADER — headers are written by users, in any language, and often say nothing ("Niveau", "Type 2", "Champ 4"). The values are what tell you what a column is.

## Fields you can assign to a column
${FIELD_DOC}

## Rules
- EVERY column gets exactly one field. Use "ignore" only when the column is genuinely worthless — never as a default. A column you cannot place but that carries real information is "extraLabels" or "extraNote", never "ignore".
- Exactly ONE column gets "title". Pick the one that reads like the name of a piece of work, not a person's name and not an id.
- Some columns are marked "[already mapped to: X]": that is what matching header names found. Keep X unless the values clearly contradict it.
- A column already mapped to labels, and another one that also holds tags, can BOTH be labels — several columns may share a field.
- Choose between extraLabels and extraNote on the values, not the header: few distinct values that repeat → extraLabels; almost one value per row, or long text → extraNote.
- Only ONE column can be "assignee". A second people column (reporter, creator, watchers) goes to extraNote, never to extraLabels.

## Value dictionaries
For the status column you picked, translate EVERY one of its distinct values to one of: ${ISSUE_STATUSES.join(", ")}.
For the priority column, to one of: ${ISSUE_PRIORITIES.join(", ")}.
For the effort column, to one of: ${ISSUE_EFFORTS.join(", ")} — but ONLY for values written in words ("Small", "Moyen"). Skip purely numeric values, they are converted separately.

- Map values in whatever language they are written.
- minddy has no "blocked", "on hold" or "paused" status: such a value means work that is not moving, so map it to todo — unless the file also shows it is being actively worked on.
- A status that means the work will not happen (Archived, Rejected, Won't do) is canceled, not done.
- If a column has no such values, return an empty list for it.
- Copy the values EXACTLY as they appear in the input, spelling and accents included.

## People — give the issues back to their owners
The project's members are listed with a number. For every distinct value of the assignee column, return the number of the member it designates, and 0 when it designates nobody in the list.

- The file and the project usually hold the SAME people under different spellings: "m.dupont@corp.com", "Marie Dupont", "Dupont, Marie", "mdupont", "Marie D." are one person.
- Only match on a genuine identity: a shared first name is NOT a match ("Marie" alone, with two Maries in the project, is 0). A wrong assignee is worse than none — an unmatched name is kept at the bottom of the description, so nothing is lost by answering 0.
- Values that are not people ("Unassigned", "-", "TBD", "Nobody") are 0.

## Labels — land in the categories the project already has
Some labels of the file matched no existing category. For each, return the existing category it BELONGS to, or "" to create it as a new category.

- Match only what is the same thing said differently: "Bugs"/"bug fix" → an existing "Bug"; "front"/"FE" → an existing "Frontend"; "UX" → an existing "Design" only if no better category exists.
- Do NOT flatten distinct meanings into one category to be tidy. Creating a new category is the RIGHT answer whenever the label means something the project has no category for. "" is not a failure.
- Never invent a category name that is not in the existing list: it is either an exact existing name, or "".

You MUST call set_mapping. Never reply in plain text.`;

const enumParam = (values: readonly string[]) => ({ type: "string", enum: [...values] });

const PARAMETERS = {
  type: "object",
  properties: {
    columns: {
      type: "array",
      description: "One entry per column of the file, all of them.",
      items: {
        type: "object",
        properties: {
          index: { type: "integer", description: "The column index given in the input." },
          field: enumParam(IMPORT_FIELDS),
        },
        required: ["index", "field"],
        additionalProperties: false,
      },
    },
    statuses: {
      type: "array",
      description: "Every distinct value of the status column, translated.",
      items: {
        type: "object",
        properties: {
          value: { type: "string", description: "The raw value, copied exactly." },
          status: enumParam(ISSUE_STATUSES),
        },
        required: ["value", "status"],
        additionalProperties: false,
      },
    },
    priorities: {
      type: "array",
      description: "Every distinct value of the priority column, translated.",
      items: {
        type: "object",
        properties: {
          value: { type: "string", description: "The raw value, copied exactly." },
          priority: enumParam(ISSUE_PRIORITIES),
        },
        required: ["value", "priority"],
        additionalProperties: false,
      },
    },
    efforts: {
      type: "array",
      description: "Word-based values of the effort column, translated. Numbers excluded.",
      items: {
        type: "object",
        properties: {
          value: { type: "string", description: "The raw value, copied exactly." },
          effort: enumParam(ISSUE_EFFORTS),
        },
        required: ["value", "effort"],
        additionalProperties: false,
      },
    },
    assignees: {
      type: "array",
      description: "Every distinct value of the assignee column, matched to a member.",
      items: {
        type: "object",
        properties: {
          value: { type: "string", description: "The raw value, copied exactly." },
          member: {
            type: "integer",
            description: "The listed member's number, or 0 if it is nobody in the list.",
          },
        },
        required: ["value", "member"],
        additionalProperties: false,
      },
    },
    labels: {
      type: "array",
      description: "Each unmatched label of the file, placed in an existing category.",
      items: {
        type: "object",
        properties: {
          value: { type: "string", description: "The label, copied exactly." },
          category: {
            type: "string",
            description: 'An EXISTING category name, or "" to create a new category.',
          },
        },
        required: ["value", "category"],
        additionalProperties: false,
      },
    },
  },
  // Un petit modèle ne répond tout simplement pas un champ hors `required`.
  required: ["columns", "statuses", "priorities", "efforts", "assignees", "labels"],
  additionalProperties: false,
} as const;

export interface ImportMappingAiInput {
  digest: CsvDigest;
  /** Les membres, dans l'ordre EXACT des refs du digest : le modèle répond un
   *  rang, c'est ici qu'il redevient un identifiant. */
  members: ImportMember[];
  /** Les catégories du projet — un nom hors liste n'est pas retenu. */
  categories: string[];
  /** Qui paye l'appel : l'auteur de l'import, qui est le owner du projet. */
  userId: string;
  projectId: string;
}

/** Le plan proposé, ou `null` si la passe n'a rien donné d'exploitable. */
export async function proposeImportMapping({
  digest,
  members,
  categories,
  userId,
  projectId,
}: ImportMappingAiInput): Promise<ImportMapping | null> {
  const cfg = await getAppConfigValues([
    ...modelConfigKeys(IMPORT_MAP_MODEL_KEY),
    IMPORT_MAP_ENABLED_KEY,
  ]);
  if ((cfg[IMPORT_MAP_ENABLED_KEY] ?? aiModelFallback(IMPORT_MAP_ENABLED_KEY)) === "false") {
    return null;
  }
  const { model } = resolveFromValues(IMPORT_MAP_MODEL_KEY, cfg);

  const args = await forcedToolCall(
    model,
    SYSTEM_PROMPT,
    renderDigest(digest),
    "set_mapping",
    PARAMETERS as unknown as Record<string, unknown>,
    {
      xTitle: "Import mapping (minddy)",
      logPrefix: "[import-map]",
      maxTokens: MAX_OUTPUT_TOKENS,
      record: {
        feature: "import_map",
        billTo: { userId },
        projectId,
      },
    }
  );
  if (!args) return null;

  const columnCount = Math.max(...digest.columns.map((c) => c.index)) + 1;
  const mapping: ImportMapping = {
    columns: Array.from({ length: columnCount }, () => "ignore" as ImportField),
    statusValues: {},
    priorityValues: {},
    effortValues: {},
    assigneeValues: {},
    labelValues: {},
  };

  for (const entry of asArray(args.columns)) {
    const index = entry.index;
    if (typeof index !== "number" || index < 0 || index >= columnCount) continue;
    if (isImportField(entry.field)) mapping.columns[index] = entry.field;
  }

  // Un plan sans titre n'est pas un plan : mieux vaut n'en proposer aucun et
  // laisser la détection par en-têtes faire ce qu'elle sait faire.
  if (!mapping.columns.includes("title")) return null;

  collectValues(args.statuses, "status", isStatus, mapping.statusValues);
  collectValues(args.priorities, "priority", isPriority, mapping.priorityValues);
  collectValues(args.efforts, "effort", isEffort, mapping.effortValues);

  // Les rangs redeviennent des identifiants ici, et NULLE PART ailleurs : le
  // modèle n'a jamais vu un UUID, il ne peut donc pas en inventer un.
  for (const entry of asArray(args.assignees)) {
    if (typeof entry.value !== "string" || typeof entry.member !== "number") continue;
    const member = members[entry.member - 1];
    const token = normalizeToken(entry.value);
    if (token && member) mapping.assigneeValues[token] = member.userId;
  }

  // Un nom de catégorie hors de la liste réelle est une invention : on l'écarte
  // et l'étiquette est créée telle quelle, ce qui est le repli correct.
  const known = new Map(categories.map((name) => [normalizeToken(name), name]));
  for (const entry of asArray(args.labels)) {
    if (typeof entry.value !== "string" || typeof entry.category !== "string") continue;
    const token = normalizeToken(entry.value);
    const target = known.get(normalizeToken(entry.category));
    if (token && target) mapping.labelValues[token] = target;
  }

  return mapping;
}

const asArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    : [];

function collectValues<T extends IssueStatusValue | IssuePriorityValue | IssueEffortValue>(
  raw: unknown,
  key: string,
  guard: (v: unknown) => v is T,
  into: Record<string, T>
) {
  for (const entry of asArray(raw)) {
    if (typeof entry.value !== "string") continue;
    const token = normalizeToken(entry.value);
    const target = entry[key];
    if (token && guard(target)) into[token] = target;
  }
}

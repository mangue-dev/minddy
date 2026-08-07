// Les LABELS d'une issue GitHub/GitLab, répartis entre les champs de minddy.
//
// Une forge n'a ni priorité ni effort : elle n'a que des labels. Mais les
// équipes y écrivent les deux, et toujours de la même poignée de façons —
// « P1 », « priority: high », « size/M », « sp: 3 », « severity 2 ». Sans cette
// passe, tout ça atterrissait en catégories : une colonne « P1 » à côté d'une
// colonne « P2 », et un backlog entier en priorité `none`.
//
// Ce sont des RÈGLES, pas un modèle : la table est celle de l'import CSV
// (`normalize.ts`, `mapPriorityToken` / `mapEffortToken` / `effortFromPoints`),
// réutilisée telle quelle pour que « High » veuille dire la même chose qu'il
// arrive d'un CSV Jira ou d'un label GitHub. Ce qu'on n'ose pas trancher reste
// une catégorie — on ne perd rien, on range juste ailleurs.
//
// Module PUR : aucune I/O, testé en node (forge-labels.test.ts).

import {
  effortFromPoints,
  mapEffortToken,
  mapPriorityToken,
  normalizeToken,
} from "@/lib/import/normalize";
import type {
  IssueEffortValue,
  IssuePriorityValue,
} from "@/lib/issue-validation";

/** Mots qui annoncent une priorité, dans un label composé (EN + FR). */
const PRIORITY_WORDS = new Set([
  "priority",
  "priorite",
  "prio",
  "p",
  "importance",
  "urgency",
  "urgence",
  "criticality",
  "criticite",
]);

/**
 * Mots qui annoncent une SÉVÉRITÉ. Séparés des précédents pour une seule
 * raison, mais elle compte : l'échelle chiffrée n'est pas la même. « P1 » est le
 * cran sous « P0 », alors que « SEV1 » est le cran du dessus — un incident SEV1
 * est le plus grave. Les confondre décale toute une convention d'un rang.
 */
const SEVERITY_WORDS = new Set(["severity", "severite", "sev", "gravite"]);

/** Mots qui annoncent une taille ou une estimation (EN + FR). */
const EFFORT_WORDS = new Set([
  "size",
  "taille",
  "effort",
  "charge",
  "estimate",
  "estimation",
  "estimated",
  "complexity",
  "complexite",
  "points",
  "point",
  "pts",
  "pt",
  "sp",
  "story",
  "stories",
  "scope",
]);

/** Les séparateurs de namespace d'un label de forge : `a:b`, `a/b`, `a=b`. */
const NAMESPACE_SEPARATORS = /[:/=|]+/g;

/** `p0`, `sev2`, `prio3` — la forme compacte, sans séparateur. */
const COMPACT_RE = /^(p|prio|priority|priorite|sev|severity|severite)(\d+)$/;

/** Rang d'urgence : plus c'est haut, plus c'est urgent. Sert à départager
 *  plusieurs labels de priorité sur la même issue, sans dépendre de leur ORDRE
 *  — une forge ne garantit pas celui de ses labels. */
const PRIORITY_RANK: Record<IssuePriorityValue, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

/** Même raison pour l'effort : le plus GROS gagne, quel que soit l'ordre. */
const EFFORT_RANK: Record<IssueEffortValue, number> = {
  xs: 1,
  s: 2,
  m: 3,
  l: 4,
  xl: 5,
};

/** Échelle « P » : 0 est le plus urgent, et au-delà de 3 tout est bas. */
function priorityFromNumber(n: number, severity: boolean): IssuePriorityValue {
  // Une échelle de sévérité commence à 1 : SEV1 vaut le P0 de l'autre.
  const level = severity ? n - 1 : n;
  if (level <= 0) return "urgent";
  if (level === 1) return "high";
  if (level === 2) return "medium";
  return "low";
}

type Reading =
  | { field: "priority"; value: IssuePriorityValue }
  | { field: "effort"; value: IssueEffortValue }
  | null;

/** Une valeur de priorité : le mot (« high », « critique »), ou le chiffre. */
function readPriority(value: string, severity: boolean): IssuePriorityValue | null {
  const word = mapPriorityToken(value);
  if (word) return word;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 9
    ? priorityFromNumber(n, severity)
    : null;
}

/** Une valeur d'effort : le t-shirt, le mot, ou les points d'une estimation. */
function readEffort(value: string): IssueEffortValue | null {
  return mapEffortToken(value) ?? effortFromPoints(value);
}

/**
 * Ce qu'un label dit, ou `null` s'il ne dit rien qu'on sache lire.
 *
 * Deux passes, et l'ordre entre elles est ce qui rend la lecture sûre :
 *
 *  1. **Le label NOMME son champ** (« priority: high », « 3 story points ») :
 *     le mot annonceur est retiré, le reste est la valeur. C'est le cas franc,
 *     et il n'a aucun angle mort — un label qui se nomme peut prendre
 *     n'importe quelle valeur du dictionnaire.
 *  2. **Le label est nu** (« critical », « small ») : on n'accepte que ce qui
 *     n'appartient qu'à UN seul champ. « medium » vaut une priorité ET une
 *     taille : nu, il ne vaut donc rien, et reste une catégorie. Deviner ici se
 *     paierait sur tout un dépôt.
 */
export function readForgeLabel(label: string): Reading {
  const token = normalizeToken(label);
  if (!token) return null;

  // `size/M` et `size: M` disent la même chose — les séparateurs de namespace
  // deviennent des espaces, et le label n'est plus qu'une suite de mots.
  const words = token.replace(NAMESPACE_SEPARATORS, " ").split(" ").filter(Boolean);

  const severity = words.some((w) => SEVERITY_WORDS.has(w));
  const named =
    severity || words.some((w) => PRIORITY_WORDS.has(w))
      ? ("priority" as const)
      : words.some((w) => EFFORT_WORDS.has(w))
        ? ("effort" as const)
        : null;

  if (named) {
    const rest = words
      .filter(
        (w) =>
          !PRIORITY_WORDS.has(w) && !SEVERITY_WORDS.has(w) && !EFFORT_WORDS.has(w),
      )
      .join(" ");
    if (!rest) return null;
    if (named === "priority") {
      const value = readPriority(rest, severity);
      return value ? { field: "priority", value } : null;
    }
    const value = readEffort(rest);
    return value ? { field: "effort", value } : null;
  }

  // Forme compacte : `p0`, `sev2`. Aucun séparateur ne les découpe.
  const compact = COMPACT_RE.exec(token);
  if (compact) {
    const value = priorityFromNumber(
      Number(compact[2]),
      SEVERITY_WORDS.has(compact[1]),
    );
    return { field: "priority", value };
  }

  // Label nu : seulement ce qui n'est pas ambigu.
  const asPriority = mapPriorityToken(token);
  const asEffort = mapEffortToken(token);
  if (asPriority && !asEffort) return { field: "priority", value: asPriority };
  if (asEffort && !asPriority) return { field: "effort", value: asEffort };
  return null;
}

export interface ForgeLabelReading {
  priority: IssuePriorityValue;
  effort: IssueEffortValue | null;
  /** Les labels qu'aucune règle n'a consommés : eux deviennent des catégories.
   *  Dédoublonnés, dans l'ordre de la forge, casse d'origine préservée. */
  labels: string[];
}

/**
 * Les labels d'une issue distante, répartis. Ce qui a servi à la priorité ou à
 * l'effort ne redevient PAS une catégorie : une colonne « P1 » à côté d'une
 * colonne « P2 » n'apprend rien qu'un tri par priorité ne dise mieux.
 */
export function readForgeLabels(raw: string[]): ForgeLabelReading {
  let priority: IssuePriorityValue = "none";
  let effort: IssueEffortValue | null = null;
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const label of raw) {
    const name = label.trim();
    if (!name) continue;
    const reading = readForgeLabel(name);
    if (reading?.field === "priority") {
      if (PRIORITY_RANK[reading.value] > PRIORITY_RANK[priority]) {
        priority = reading.value;
      }
      continue;
    }
    if (reading?.field === "effort") {
      if (!effort || EFFORT_RANK[reading.value] > EFFORT_RANK[effort]) {
        effort = reading.value;
      }
      continue;
    }
    const key = normalizeToken(name);
    if (key && !seen.has(key)) {
      seen.add(key);
      labels.push(name);
    }
  }

  return { priority, effort, labels };
}

// The LABELS of a GitHub/GitLab issue, distributed between minddy fields.
//
// A forge has neither priority nor effort: it only has labels. But the
// teams write both, and always in the same handful of ways —
// « P1 », « priority: high », « size/M », « sp: 3 », « severity 2 ». Sans cette
// pass, all this landed in categories: a “P1” column next to a
// column “P2”, and an entire backlog in priority `none`.
//
// These are RULES, not a model: the table is that of the CSV import
// (`normalize.ts`, `mapPriorityToken` / `mapEffortToken` / `effortFromPoints`),
// reused as is so that “High” means the same thing as it
// arrive d'un CSV Jira ou d'un label GitHub. Ce qu'on n'ose pas trancher reste
// a category — we don't lose anything, we just store it elsewhere.
//
// PUR module: no I/O, tested in node (forge-labels.test.ts).

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

/** Words which announce a priority, in a compound label (EN + FR). */
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
 * Words that announce SEVERITY. Separated from the previous ones for only one
 * reason, but it matters: the numerical scale is not the same. “P1” is the
 * notch below “P0”, while “SEV1” is the notch above — an SEV1
 * incident is the most serious. Confusing them shifts an entire convention by one rank.
 */
const SEVERITY_WORDS = new Set(["severity", "severite", "sev", "gravite"]);

/** Words that announce a size or an estimate (EN + FR). */
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

/** The namespace separators of a forge label: `a:b`, `a/b`, `a=b`. */
const NAMESPACE_SEPARATORS = /[:/=|]+/g;

/** `p0`, `sev2`, `prio3` — the compact form, without separators. */
const COMPACT_RE = /^(p|prio|priority|priorite|sev|severity|severite)(\d+)$/;

/** Urgency Rank: The higher it is, the more urgent it is. Used to decide between
 * several priority labels on the same outcome, without depending on their ORDER
 * — a forge does not guarantee that of its labels. */
const PRIORITY_RANK: Record<IssuePriorityValue, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

/** Same reason for effort: the BIGGEST wins, regardless of order. */
const EFFORT_RANK: Record<IssueEffortValue, number> = {
  xs: 1,
  s: 2,
  m: 3,
  l: 4,
  xl: 5,
};

/** “P” scale: 0 is the most urgent, and beyond 3 everything is low. */
function priorityFromNumber(n: number, severity: boolean): IssuePriorityValue {
  // A severity scale starts at 1: SEV1 is worth the P0 of the other.
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

/** A priority value: the word (“high”, “critical”), or the number. */
function readPriority(value: string, severity: boolean): IssuePriorityValue | null {
  const word = mapPriorityToken(value);
  if (word) return word;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 9
    ? priorityFromNumber(n, severity)
    : null;
}

/** An effort value: the t-shirt, the word, or the points of an estimate. */
function readEffort(value: string): IssueEffortValue | null {
  return mapEffortToken(value) ?? effortFromPoints(value);
}

/**
 * What a label says, or `null` if it doesn't say anything that we can read.
 *
 * Two passes, and the order between them is what makes reading safe:
 *
 * 1. **The label NAMES its field** (“priority: high”, “3 story points”):
 * the word advertiser is removed, the rest is the value. This is the straightforward case,
 * and it has no blind spot — a label which is named can take
 * any value from the dictionary.
 * 2. **The label is bare** (“critical”, “small”): we only accept what
 * only belongs to ONE field. “medium” is worth a priority AND a
 * size: bare, it is therefore worth nothing, and remains a category. Guessing here se
 * would pay out on a whole deposit.
 */
export function readForgeLabel(label: string): Reading {
  const token = normalizeToken(label);
  if (!token) return null;

  // `size/M` and `size: M` say the same thing — namespace separators
  // become spaces, and the label is nothing more than a series of words.
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

  // Compact form: `p0`, `sev2`. No separator cuts them.
  const compact = COMPACT_RE.exec(token);
  if (compact) {
    const value = priorityFromNumber(
      Number(compact[2]),
      SEVERITY_WORDS.has(compact[1]),
    );
    return { field: "priority", value };
  }

  // Bare label: only what is not ambiguous.
  const asPriority = mapPriorityToken(token);
  const asEffort = mapEffortToken(token);
  if (asPriority && !asEffort) return { field: "priority", value: asPriority };
  if (asEffort && !asPriority) return { field: "effort", value: asEffort };
  return null;
}

export interface ForgeLabelReading {
  priority: IssuePriorityValue;
  effort: IssueEffortValue | null;
  /** Labels that no rule has consumed: they become categories.
 * Duplicated, in the order of the forge, original case preserved. */
  labels: string[];
}

/**
 * The labels of a remote issue, distributed. What was used for priority or
 * the effort does NOT become a category again: a “P1” column next to a
 * “P2” column does not learn anything that sorting by priority does not say better.
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

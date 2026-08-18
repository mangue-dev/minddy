import "server-only";

import { isEffort, isPriority } from "@/lib/issue-validation";
import { MAX_TITLE_LENGTH, normalizeToken } from "@/lib/import/normalize";
import type { ImportedIssue } from "@/lib/import/types";
import {
  MAX_SEED_DISTINCT_LABELS,
  MAX_SEED_ISSUES,
  MAX_SEED_LABELS,
  MAX_SEED_OBJECTIVES,
  type SeedIssue,
  type SeedObjective,
  type SeedProposal,
} from "@/lib/seed/types";

/**
 * The brief bootstrap gate (MIN-172): what comes from the browser is
 * never believed.
 *
 * The preview is editable — titles rewritten, tickets unchecked, goals
 * abandoned — so the commit body is an object that the user a
 * made, in a tab that we do not control. It comes back whole here:
 * validated enumerations (`isPriority`, `isEffort`), truncated titles like those
 * of an import, batch ceilings, objective and parent keys resolved AGAINST
 * THE BATCH — a key which does not designate anything in the batch is simply dropped, never
 * followed.
 *
 * The model proposal goes through the same function (`brief-to-issues.ts`):
 * only one door, so the preview cannot show a ticket that writing
 * would deny then.
 */

/** Length of a proposed description — a few lines, not a document. */
const MAX_DESCRIPTION_LENGTH = 10_000;
/** Objective summary: two sentences. */
const MAX_SUMMARY_LENGTH = 2_000;
/** A synthetic batch key ("O1", "T14") — never a real identifier. */
const MAX_KEY_LENGTH = 40;
const MAX_LABEL_LENGTH = 60;

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/**
 * Cleans up a proposition, wherever it comes from. Never raise and reject
 * the entire batch: each invalid entry is discarded alone, because a malformed
 * ticket should not cost the other thirty-nine.
 */
export function sanitizeSeedProposal(raw: unknown): SeedProposal {
  const input = (raw ?? {}) as { objectives?: unknown; issues?: unknown };

  // ── Objectives: unique keys, a mandatory name ──
  const objectives: SeedObjective[] = [];
  const objectiveKeys = new Set<string>();
  for (const entry of asRecords(input.objectives)) {
    if (objectives.length >= MAX_SEED_OBJECTIVES) break;
    const key = text(entry.key, MAX_KEY_LENGTH);
    const name = text(entry.name, MAX_TITLE_LENGTH);
    const token = normalizeToken(key);
    if (!token || !name || objectiveKeys.has(token)) continue;
    objectiveKeys.add(token);
    objectives.push({ key, name, summary: text(entry.summary, MAX_SUMMARY_LENGTH) });
  }
  const objectiveKeyByToken = new Map(
    objectives.map((objective) => [normalizeToken(objective.key), objective.key])
  );

  // ── Tickets: two passes, because a parent can be cited before existing ──
  const issues: SeedIssue[] = [];
  const issueKeys = new Set<string>();
  for (const entry of asRecords(input.issues)) {
    if (issues.length >= MAX_SEED_ISSUES) break;
    const key = text(entry.key, MAX_KEY_LENGTH);
    const title = text(entry.title, MAX_TITLE_LENGTH);
    const token = normalizeToken(key);
    // Without a key or title, there is no ticket; a duplicate key
    // would overwrite the first one in the parent resolution table.
    if (!token || !title || issueKeys.has(token)) continue;
    issueKeys.add(token);

    issues.push({
      key,
      title,
      description: text(entry.description, MAX_DESCRIPTION_LENGTH),
      objectiveKey: objectiveKeyByToken.get(normalizeToken(text(entry.objectiveKey, MAX_KEY_LENGTH))) ?? "",
      priority: isPriority(entry.priority) ? entry.priority : "none",
      effort: isEffort(entry.effort) ? entry.effort : null,
      // Resolved in the next pass, once the entire batch is known.
      parentKey: text(entry.parentKey, MAX_KEY_LENGTH),
      labels: sanitizeLabels(entry.labels),
    });
  }

  // The parents, in two passes as during import (`lib/import/parse.ts`):
  // first the keys which do not designate anything from the selected batch (or oneself), then
  // those whose parent is itself a subticket — a single level.
  const byToken = new Map(issues.map((issue) => [normalizeToken(issue.key), issue]));
  for (const issue of issues) {
    if (!issue.parentKey) continue;
    const parent = byToken.get(normalizeToken(issue.parentKey));
    issue.parentKey = !parent || parent === issue ? "" : parent.key;
  }
  for (const issue of issues) {
    if (!issue.parentKey) continue;
    const parent = byToken.get(normalizeToken(issue.parentKey))!;
    if (parent.parentKey) issue.parentKey = "";
  }

  keepTopLabels(issues);

  return { objectives, issues };
}

/**
 * The labels that will become categories: the most CAREFUL of the lot, and
 * six at most.
 *
 * A model labels as it reads — it returns one label per subject
 * that it encounters. Measured on a real brief: thirteen categories for twenty-two
 * tickets, nine of which are worn only once. A project that has just been born must not open its picker on thirteen entries that no one uses.
 *
 * A ceiling, and nothing else: “discarding what a single ticket carries” is defended on twenty tickets, but would empty the labels of a batch of three. The
 * ceiling only bites where there are actually too many categories.
 * Nothing is lost: what the label said is in the title and the
 * description. At equal frequency, the order of appearance varies — the result
 * is stable.
 */
function keepTopLabels(issues: SeedIssue[]): void {
  const counts = new Map<string, { count: number; rank: number }>();
  for (const issue of issues) {
    for (const label of issue.labels) {
      const token = normalizeToken(label);
      const entry = counts.get(token);
      if (entry) entry.count += 1;
      else counts.set(token, { count: 1, rank: counts.size });
    }
  }
  if (counts.size <= MAX_SEED_DISTINCT_LABELS) return;

  const kept = new Set(
    [...counts.entries()]
      .sort(([, a], [, b]) => b.count - a.count || a.rank - b.rank)
      .slice(0, MAX_SEED_DISTINCT_LABELS)
      .map(([token]) => token)
  );
  for (const issue of issues) {
    issue.labels = issue.labels.filter((label) => kept.has(normalizeToken(label)));
  }
}

/**
 * The committed proposal, as the import path writes it. Status
 * `backlog`: the user has just reread each ticket in the preview, putting it through the triage again would require the user to repeat the action he has just made.
 *
 * `objectiveIdByKey` carries the REALLY created objectives: a key absent
 * (objective unchecked, creation failed) leaves the ticket without objective rather than
 * causing the batch to fail.
 */
export function seedProposalToImportedIssues(
  proposal: SeedProposal,
  objectiveIdByKey: Map<string, string>
): ImportedIssue[] {
  return proposal.issues.map((issue) => ({
    title: issue.title,
    description: issue.description || null,
    status: "backlog" as const,
    priority: issue.priority,
    effort: issue.effort,
    labels: issue.labels,
    assigneeId: null,
    dueDate: null,
    createdAt: null,
    completedAt: null,
    // The batch key becomes the external key: it is through this that the import
    // attaches the sub-tickets, without any real identifier having been circulated.
    externalKeys: [issue.key],
    parentExternalKey: issue.parentKey || null,
    objectiveId: objectiveIdByKey.get(issue.objectiveKey) ?? null,
  }));
}

function sanitizeLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (labels.length >= MAX_SEED_LABELS) break;
    const label = text(value, MAX_LABEL_LENGTH);
    const token = normalizeToken(label);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    labels.push(label);
  }
  return labels;
}

const asRecords = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    : [];

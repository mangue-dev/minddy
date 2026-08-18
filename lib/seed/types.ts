// The proposal to initiate a project (MIN-172), as it travels: the
// server factory (`lib/server/brief-to-issues.ts`), browser
// displays it and edits it (`components/project-seed/`), the server reads it again
// and validate it before writing (`lib/server/seed-issues.ts`).
//
// Isomorphic like `lib/import/types.ts`, and for the same reason: it is the
// ONLY contract between the three, and what goes to commit is what the preview has
// watch. The keys (`O1`, `T4`) are synthetic and only have meaning
// inside a batch — they are used to link a ticket to its purpose and to
// its parent without any real identifier having to pass through the model.

import type { IssueEffortValue, IssuePriorityValue } from "@/lib/issue-validation";

/** A work of the brief: what will become an objective of the project. */
export interface SeedObjective {
  /** Synthetic key of the batch ("O1"). */
  key: string;
  name: string;
  /** One or two sentences — the description of the objective created. */
  summary: string;
}

/** A proposed ticket. All fields are present, even if they are empty: this
 * which is missing on the screen cannot be repaired, it is unchecked. */
export interface SeedIssue {
  /** Synthetic batch key ("T7"). */
  key: string;
  title: string;
  /** Markdown. */
  description: string;
  /** Key to a `SeedObjective` of the same batch, or "" — tickets without a site
 * exist (a foundation, an isolated task) and are stored together. */
  objectiveKey: string;
  priority: IssuePriorityValue;
  effort: IssueEffortValue | null;
  /** Key to another `SeedIssue` in the same batch, or "" — a single level. */
  parentKey: string;
  /** Labels → project categories (created if necessary by import). */
  labels: string[];
}

export interface SeedProposal {
  objectives: SeedObjective[];
  issues: SeedIssue[];
}

/**
 * Ceilings — guardrails against a model exit going into a tailspin, not
 * product limits. A reasonable brief yields three to six sites and
 * ten to forty tickets (MIN-170); beyond that, it is no longer a primer reread at
 * the screen, it is an import.
 */
export const MAX_SEED_OBJECTIVES = 10;
export const MAX_SEED_ISSUES = 60;
/** Labels per ticket — beyond that, categorization no longer means anything. */
export const MAX_SEED_LABELS = 4;
/**
 * DISTINCT labels on the entire lot — the most worn wins
 * (`keepTopLabels`, `lib/server/seed-issues.ts`). Measured on a real brief:
 * the model returns one per subject it encounters, i.e. thirteen categories for
 * twenty-two tickets, including nine worn only once. A project that has just been born must not open its picker on thirteen entries.
 */
export const MAX_SEED_DISTINCT_LABELS = 6;

/**
 * Length of pasted text. A brief is the SUMMARY of a reflection carried out
 * elsewhere, not the entire conversation: a few thousand words are enough,
 * and this is also what keeps the call at a starter price.
 *
 * The ceiling is UNDER that of a chat message (12,000 characters,
 * `sanitizeAssistantMessageContent`), framing sentence included: from
 * MIN-173 the brief pasted into the wizard travels as the first message of a
 * conversation with Numo. Above, it would be silently truncated upon entry to
 * the API — and that's the end of the brief, the one that says out-of-scope, which
 * would disappear.
 */
export const MAX_BRIEF_CHARS = 10_000;
/** Below, there is nothing to cut — the button remains off. */
export const MIN_BRIEF_CHARS = 40;

export const EMPTY_SEED_PROPOSAL: SeedProposal = { objectives: [], issues: [] };

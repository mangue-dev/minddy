import { useCallback, useSyncExternalStore } from "react";
import type { Issue, IssueCardIssue } from "./types";

/**
 * SMART FILL REVEAL (MIN-1032) — which board cards Smart Fill is still
 * filling, and which ones are unveiling what it wrote.
 *
 * A Smart Fill creation places its card at once, empty: the server fills the
 * issue before inserting it, which takes a few seconds. During that wait the
 * card shows its PLACEHOLDER, the issue as the author left it, frozen here:
 * a realtime echo of the filled row may reach the cache before the POST
 * returns, and the card must not change under the user's eyes before the
 * sweep starts. Once the filled row lands, the card plays the reveal, then
 * clears its entry.
 *
 * Module state, not React state: the creation path is a plain function (it
 * runs from the board, the cross-project board and the app-wide dialog), and
 * the card that animates may mount later or not at all (another view, a
 * column scrolled out of the window). A landed entry therefore expires on
 * its own, so a card that never mounted leaves nothing behind.
 */

export type SmartFillRevealPhase = "filling" | "revealing";

export interface SmartFillRevealEntry {
  phase: SmartFillRevealPhase;
  /** The card as the author left it, shown until the reveal swaps it out. */
  placeholder: Issue;
  /** The description, when Smart Fill is to write the missing title: the
      card shows it, muted, in place of a title (MIN-1032). */
  description: string | null;
  /** The filled row the server returned, once it has landed. */
  landed?: Issue;
}

/** How long a landed entry waits for its card to play and clear it. */
export const SMART_FILL_REVEAL_EXPIRY_MS = 4_000;

const entries = new Map<string, SmartFillRevealEntry>();
const expiries = new Map<string, ReturnType<typeof setTimeout>>();
/** Each card listens to its own id only: a change wakes the card it names,
    not the hundreds of others on the board. */
const listeners = new Map<string, Set<() => void>>();

function emit(issueId: string): void {
  const set = listeners.get(issueId);
  if (set) for (const listener of set) listener();
}

function clearExpiry(issueId: string): void {
  const timer = expiries.get(issueId);
  if (timer !== undefined) clearTimeout(timer);
  expiries.delete(issueId);
}

/** The card was just placed: show its placeholder until the filled row lands. */
export function beginSmartFillReveal(placeholder: Issue, description: string | null = null): void {
  clearExpiry(placeholder.id);
  entries.set(placeholder.id, { phase: "filling", placeholder, description });
  emit(placeholder.id);
}

/**
 * The filled row was written to the caches: the card may play its reveal as
 * soon as it renders that row (see `cardShowsLandedRow`).
 */
export function landSmartFillReveal(landed: Issue): void {
  const issueId = landed.id;
  const entry = entries.get(issueId);
  if (!entry) return;
  if (entry.phase !== "revealing") {
    entries.set(issueId, { ...entry, phase: "revealing", landed });
    emit(issueId);
  }
  clearExpiry(issueId);
  expiries.set(
    issueId,
    setTimeout(() => endSmartFillReveal(issueId), SMART_FILL_REVEAL_EXPIRY_MS),
  );
}

/** The reveal finished, or the creation failed: the card is a plain card again. */
export function endSmartFillReveal(issueId: string): void {
  clearExpiry(issueId);
  if (entries.delete(issueId)) emit(issueId);
}

export function getSmartFillReveal(issueId: string): SmartFillRevealEntry | undefined {
  return entries.get(issueId);
}

function subscribe(issueId: string, listener: () => void): () => void {
  let set = listeners.get(issueId);
  if (!set) {
    set = new Set();
    listeners.set(issueId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(issueId);
  };
}

/**
 * The entry of one card, or undefined for every card Smart Fill is not
 * touching. Each card subscribes to its own id, so a change re-renders only
 * the card it names.
 */
export function useSmartFillReveal(issueId: string): SmartFillRevealEntry | undefined {
  const listen = useCallback((listener: () => void) => subscribe(issueId, listener), [issueId]);
  const read = useCallback(() => entries.get(issueId), [issueId]);
  return useSyncExternalStore(listen, read, noEntry);
}

function noEntry(): undefined {
  return undefined;
}

/** The fields Smart Fill and the server set on a new issue, as a card shows them. */
const LANDED_FIELDS = ["title", "number", "priority", "effort", "objective_id", "assignee_id"] as const;

/**
 * Does the card already render the landed row? The reveal store learns the
 * row at once, while the board reads it from its query cache, which notifies
 * its views on a later tick: started on the store's signal alone, the sweep
 * unveiled the empty card and the title popped in after it (MIN-1032).
 */
export function cardShowsLandedRow(live: IssueCardIssue, landed: IssueCardIssue): boolean {
  if (LANDED_FIELDS.some((field) => live[field] !== landed[field])) return false;
  const liveCategories = live.category_ids ?? [];
  const landedCategories = landed.category_ids ?? [];
  return (
    liveCategories.length === landedCategories.length &&
    landedCategories.every((id) => liveCategories.includes(id))
  );
}

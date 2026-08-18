"use client";

/**
 * Pages created DURING THIS VISIT and not yet written (MIN-270).
 *
 * Creating a page should not save it: we open the “+”, we come across
 * something else, we leave again — and there should be nothing left. The page nevertheless exists
 * in base from the first moment, and this is deliberate: its id is what gives
 * a shareable URL, a presence, a subpage block in the parent, and
 * automatic registration from the first letter. What we differ is not
 * therefore not the creation, it is the fact that it SURVIVES.
 *
 * Hence this table: it remembers which pages are still drafts.
 * Leave one of them without having put any title, icon or text there
 * destroyed (`discardPageApi`); the first letter typed takes it out and it
 * becomes a page like the others again.
 *
 * A set at the MODULE level, and not a React state: the information must
 * survive the disassembly of the component that produces it — this is precisely when
 * where `PageView` is disassembled as it is read. It is voluntarily LOST on
 * reloading the tab: a page that we left by closing the browser
 * can no longer be retrieved by anyone, and destroying it upon return would be a
 * surprise rather than a service.
 */
const drafts = new Set<string>();

/** This page has just been created: it will not survive leaving without writing. */
export function markDraftPage(pageId: string): void {
  drafts.add(pageId);
}

export function isDraftPage(pageId: string): boolean {
  return drafts.has(pageId);
}

/** It has been written, destroyed, or its fate has been resolved: it is no longer a draft. */
export function forgetDraftPage(pageId: string): void {
  drafts.delete(pageId);
}

/**
 * SCHEDULED destructions, and why they are not immediate.
 *
 * The signal to start is the disassembly of `PageView`. In development, React
 * mounts, disassembles and reassembles each component (Strict Mode): a destruction
 * done in the disassembly would destroy the page the second it is created, without anyone having left anything. We therefore program it, and an immediate reassembly
 * cancels it - the delay only needs to be longer than this beat.
 *
 * This is not just a development artifice: the same beat can come
 * from a rerun of Suspense or from an abandoned competing rendition. Reporting from a
 * hair destruction has no cost; doing it for nothing has one.
 */
const DISCARD_DELAY_MS = 60;

const pending = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleDraftDiscard(pageId: string, discard: () => void): void {
  cancelDraftDiscard(pageId);
  pending.set(
    pageId,
    setTimeout(() => {
      pending.delete(pageId);
      drafts.delete(pageId);
      discard();
    }, DISCARD_DELAY_MS)
  );
}

/** We came back (or we never left): the page lives. */
export function cancelDraftDiscard(pageId: string): void {
  const timer = pending.get(pageId);
  if (timer === undefined) return;
  clearTimeout(timer);
  pending.delete(pageId);
}

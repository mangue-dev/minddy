/**
 * DRAG-DROP the page tree (MIN-270), in pure logic.
 *
 * A hovered line offers three targets, and not one more: above it,
 * below it, or IN. This is the grammar of Notion, and it is the only one
 * that allows you to reorder and reparent with the same gesture — a tree where
 * moving only reorders requires a second gesture ("move
 * to...") for what is the most frequent action.
 *
 * Nothing here affects the network: the function returns the pair `parent_id` /
 * `position` that the PATCH will send, or `null` when the gesture makes no sense.
 * `null` is not an error — that's what prevents the deposit indicator of
 * lights up under the cursor, even before a click is sent to the server.
 *
 * The guard of CYCLE is replayed here, while the server is already carrying it: without
 * it, we would let the user drop a page in his own descendant
 * only to respond with a toast of failure half a second later. The server
 * remains the authority (another tab may have moved the page in the meantime); this one
 * is only there to avoid proposing a gesture which we know will be refused.
 */

import {
  byPosition,
  positionBetween,
  wouldCreateCycle,
  type PageRow,
} from "./pages";

/** Where the page falls relative to the hovered line. */
export type PageDropMode = "before" | "after" | "inside";

export interface PageMove {
  parent_id: string | null;
  position: string;
}

/**
 * The HIGH third of a line deposits before, the LOWER third deposits after, the middle
 * deposits inside. A third and not a quarter: the “inside” zone is the one that changes the structure, and it is also the hardest to target — giving it more space than the other two would instead make it too easy to trigger by accident when trying to reorder.
 */
export function dropModeAt(offsetY: number, height: number): PageDropMode {
  if (height <= 0) return "inside";
  const ratio = offsetY / height;
  if (ratio < 1 / 3) return "before";
  if (ratio > 2 / 3) return "after";
  return "inside";
}

/**
 * The move to write, or `null` if the gesture does not make sense: drop a
 * page on itself, or drop it in its own descendants.
 *
 * `pages` is the FLAT list, as it is in the cache : the siblings referred to in
 * are extracted and sorted here, the moved page removed from the account — otherwise
 * "drop after my neighbor downstairs" would calculate a position between him and
 * me, that is to say in the same place as before.
 */
export function computePageMove(
  pages: readonly PageRow[],
  dragId: string,
  targetId: string,
  mode: PageDropMode
): PageMove | null {
  if (dragId === targetId) return null;

  const target = pages.find((page) => page.id === targetId);
  if (!target) return null;

  const parentId = mode === "inside" ? target.id : target.parent_id;
  if (wouldCreateCycle(pages, dragId, parentId)) return null;

  const siblings = pages
    .filter(
      (page) => page.id !== dragId && (page.parent_id ?? null) === parentId
    )
    .sort(byPosition);

  if (mode === "inside") {
    // At the END of the subpages: this is where we read a page that we have just
    // tidy up, and this is also what creating a subpage does.
    const last = siblings[siblings.length - 1];
    return { parent_id: parentId, position: positionBetween(last?.position, null) };
  }

  const index = siblings.findIndex((page) => page.id === targetId);
  if (index === -1) {
    // The target is no longer in its own sibling group (offset cache): we fall into
    // end of list rather than refusing a gesture that the user has made.
    const last = siblings[siblings.length - 1];
    return { parent_id: parentId, position: positionBetween(last?.position, null) };
  }

  const before = mode === "before" ? siblings[index - 1] : siblings[index];
  const after = mode === "before" ? siblings[index] : siblings[index + 1];
  return {
    parent_id: parentId,
    position: positionBetween(before?.position, after?.position),
  };
}

/**
 * Where a page transaction came from, for live collaboration (MIN-688).
 *
 * A dependency-free module on purpose: the block registry (the subpage block)
 * reads it, and the collaboration document module imports that registry.
 */

/** The meta key `prosemirror-collab` sets on every transaction it creates. */
export const COLLAB_META = "collab$";

/**
 * Marks the local transaction that re-expresses unconfirmed work after a reset
 * or a reattachment. It is a real local edit (it will be sent), but not a new
 * gesture: block-removal detectors must not read it as one.
 */
export const COLLAB_REBUILD_META = "pageCollabRebuild";

/**
 * A transaction that did not come from the person at this keyboard: steps
 * received from the authority (or a rebase of ours around them), a reset, a
 * reattachment. Detectors of user gestures — a removed subpage block, block ID
 * generation — must ignore it, or every collaborator would react to one edit.
 */
export function isCollabRemoteTransaction(tr: { getMeta(key: string): unknown }): boolean {
  return tr.getMeta(COLLAB_META) !== undefined || tr.getMeta(COLLAB_REBUILD_META) === true;
}

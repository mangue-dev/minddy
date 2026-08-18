/**
 * BLOCK MERGE of a page document (MIN-271) — pure logic, no IO.
 *
 * A page is shared by the entire project, and two people can open it
 * at the same time. The guardrail is a counter: each body writing sends
 * the `version` on which it relies, and the server refuses (409) if it has
 * moved. It remains to know what to do with the refusal — and that's what this module is all about.
 *
 * The document is a TREE, not a list of lines: we therefore do not merge
 * “block B” in isolation, we merge the entire document by comparing the
 * FIRST LEVEL blocks by their `blockId` (set by `UniqueID`, MIN-267).
 * It's the granularity that the user perceives — a paragraph, a title, a
 * list — and the only one that survives drag and drop: moving a rewritten block
 * two places in the tree at the same time, which means that no "block" saving is possible
 * literal meaning cannot represent.
 *
 * Trois documents entrent :
 * `base` — the one I relied on (my last sync);
 * `mine` — what I have on the screen;
 * `theirs` — what the server is carrying now.
 *
 * And the rule is contained in one sentence: **the distant wins, never in silence.**
 * A block that I am the only one to have touched is taken as is (mute merge,
 * this is the common case: B at mine, C at the other). A block we have
 * touched both keeps the REMOTE version in the document, and mine
 * appears in `conflicts` — the caller offers it for restoration
 * (`applyRestore`). Choosing mine silently would erase the work of
 * the other, what this feature exists precisely to prevent.
 *
 * What this module does NOT do: merge the INSIDE of a block. Two
 * people who type in the same paragraph at the same second fall under the
 * character by character, therefore from `prosemirror-collab` — excluding v1. It is
 * precisely this case which becomes a reported conflict.
 */

import { BLOCK_ID_ATTRIBUTE } from "@/components/pages/blocks";

/** A ProseMirror node in JSON, seen from the outside. */
export interface PageNodeJSON {
  type?: string;
  attrs?: Record<string, unknown> | null;
  content?: PageNodeJSON[];
  [key: string]: unknown;
}

/** The document, as stored in `pages.content`. */
export interface PageDocJSON extends PageNodeJSON {
  type?: string;
  content?: PageNodeJSON[];
}

/**
 * A block that both sides have touched.
 *
 * `mine` is what I HAD — the content offered in catering —, `null`
 * when my action was a suppression. `theirs` is what was retained in
 * the merged document, `null` when it was a remote deletion which
 * won.
 */
export interface PageBlockConflict {
  id: string;
  mine: PageNodeJSON | null;
  theirs: PageNodeJSON | null;
}

export interface PageMergeResult {
  /** The document to adopt. Always defined, even in the presence of conflicts. */
  doc: PageDocJSON;
  /** The contested blocks, in document order. Empty = silent merge. */
  conflicts: PageBlockConflict[];
  /**
   * Does the merge bring something that the server doesn't have? This is what
   * who decides the REPLAY: without that, a conflict where I have nothing to save
   * would restart a writing identical to what is already in base.
   */
  changed: boolean;
}

/* ─── Lecture du document ──────────────────────────────────────────────────── */

/**
 * The first level blocks, each with its KEY.
 *
 * The key is the `blockId` when there is one. A block that does not carry any —
 * document written before MIN-267, or pasted from a source that does not pose one —
 * takes a position key (`@3`). It's worth what it's worth: two documents
 * whose anonymous blocks have moved will not compare finely. It is
 * better than leaving them without a key at all, which would cause them all to
 * confuse and disappear at the first merger.
 */
function blockKey(node: PageNodeJSON, index: number): string {
  const id = node.attrs?.[BLOCK_ID_ATTRIBUTE];
  return typeof id === "string" && id.length > 0 ? id : `@${index}`;
}

function topLevel(doc: PageDocJSON | null | undefined): PageNodeJSON[] {
  return Array.isArray(doc?.content) ? doc.content : [];
}

interface Indexed {
  keys: string[];
  byKey: Map<string, PageNodeJSON>;
}

function indexBlocks(doc: PageDocJSON | null | undefined): Indexed {
  const keys: string[] = [];
  const byKey = new Map<string, PageNodeJSON>();
  topLevel(doc).forEach((node, index) => {
    let key = blockKey(node, index);
    // A duplicate id (copy-paste from a block into a client that does not have
    // regenerated its id) would make the map ambiguous: the second takes a key from
    // position, which treats it as an anonymous block rather than the
    // jumeau du premier.
    if (byKey.has(key)) key = `@${index}`;
    keys.push(key);
    byKey.set(key, node);
  });
  return { keys, byKey };
}

/** Structural equality. The documents come from the same serializer, but
    the key order of a JSON object is not guaranteed by anyone. */
export function sameNode(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, i) => sameNode(item, b[i]));
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!sameNode(left[key], right[key])) return false;
  }
  return true;
}

/* ─── The merger ─────────────────────────────── ─────────────────────────────── */

/** Comes out in one block, once both sides have been read. */
interface Decision {
  /** The retained node, `null` when the block leaves the document. */
  node: PageNodeJSON | null;
  conflict: PageBlockConflict | null;
}

function decide(
  key: string,
  base: PageNodeJSON | undefined,
  mine: PageNodeJSON | undefined,
  theirs: PageNodeJSON | undefined
): Decision {
  const inBase = base !== undefined;

  if (mine !== undefined && theirs !== undefined) {
    if (sameNode(mine, theirs)) return { node: theirs, conflict: null };
    const mineChanged = !inBase || !sameNode(mine, base);
    const theirsChanged = !inBase || !sameNode(theirs, base);
    if (mineChanged && !theirsChanged) return { node: mine, conflict: null };
    if (!mineChanged && theirsChanged) return { node: theirs, conflict: null };
    // Both wrote in the same block: the distant one remains, mine is
    // offered. This is THE case that the CRDT would have merged character by
    // character, and the one we prefer to point out rather than decide.
    return { node: theirs, conflict: { id: key, mine, theirs } };
  }

  if (mine !== undefined) {
    // A block that I ADDED (absent from the base) does not compete with
    // nothing: it enters the merged document.
    if (!inBase) return { node: mine, conflict: null };
    // They deleted it. If I just left it as is, deleting
    // passes without noise; if I had changed it, she still wins — but
    // pas en silence.
    const mineChanged = !sameNode(mine, base);
    return {
      node: null,
      conflict: mineChanged ? { id: key, mine, theirs: null } : null,
    };
  }

  if (theirs !== undefined) {
    if (!inBase) return { node: theirs, conflict: null };
    // I deleted it. They modified it → their version remains, and I
    // discovers: `mine: null` says that my action was a deletion, therefore
    // that “to restore mine” means to remove it.
    const theirsChanged = !sameNode(theirs, base);
    return {
      node: theirs,
      conflict: theirsChanged ? { id: key, mine: null, theirs } : null,
    };
  }

  return { node: null, conflict: null };
}

/** Has the relative order of common blocks changed between two versions? */
function reordered(before: string[], after: string[]): boolean {
  const kept = new Set(after);
  const left = before.filter((key) => kept.has(key));
  const has = new Set(before);
  const right = after.filter((key) => has.has(key));
  return left.length !== right.length || left.some((key, i) => key !== right[i]);
}

/**
 * Merge my document and that of the server, on the common base.
 *
 * ORDER comes from one side only: the one who reordered. Drag and drop
 * rewrites the entire sibling order, so interleaving two orders would produce
 * a sequel that no one wanted. When only one of the two has moved, its continuation
 * is authentic; when both have moved (or neither), it is that of the server, and
 * the blocks that the other side added slide in behind their neighbor.
 */
export function mergeDocs(
  base: PageDocJSON | null | undefined,
  mine: PageDocJSON | null | undefined,
  theirs: PageDocJSON | null | undefined
): PageMergeResult {
  const server: PageDocJSON = theirs ?? { type: "doc", content: [] };

  // Nothing to merge: I haven't touched anything from my base, or I have already
  // exactly what the waiter is wearing.
  if (!mine || sameNode(mine, server)) {
    return { doc: server, conflicts: [], changed: false };
  }
  if (base && sameNode(mine, base)) {
    return { doc: server, conflicts: [], changed: false };
  }

  const b = indexBlocks(base);
  const m = indexBlocks(mine);
  const s = indexBlocks(server);

  const decisions = new Map<string, Decision>();
  for (const key of new Set([...b.keys, ...m.keys, ...s.keys])) {
    decisions.set(key, decide(key, b.byKey.get(key), m.byKey.get(key), s.byKey.get(key)));
  }

  // Who moved the order? The question only arises on the blocks that the base
  // knew: an addition is not a move.
  const mineMoved = base ? reordered(b.keys, m.keys) : false;
  const theirsMoved = base ? reordered(b.keys, s.keys) : false;
  const spineFromMine = mineMoved && !theirsMoved;
  const spine = spineFromMine ? m.keys : s.keys;
  const other = spineFromMine ? s.keys : m.keys;

  const kept = (key: string) => decisions.get(key)?.node != null;
  const order = spine.filter(kept);

  // What the other side added slips BEHIND its neighbor on the left, the one
  // with which it was written. Adding at the end of the document would put a
  // paragraph inserted in the middle of a chapter at the very bottom of the page.
  const placed = new Set(order);
  for (let i = 0; i < other.length; i += 1) {
    const key = other[i];
    if (placed.has(key) || !kept(key)) continue;
    let at = 0;
    for (let j = i - 1; j >= 0; j -= 1) {
      const anchor = order.indexOf(other[j]);
      if (anchor !== -1) {
        at = anchor + 1;
        break;
      }
    }
    order.splice(at, 0, key);
    placed.add(key);
  }

  const content = order.map((key) => decisions.get(key)!.node!);
  const conflicts: PageBlockConflict[] = [];
  for (const key of order) {
    const conflict = decisions.get(key)?.conflict;
    if (conflict) conflicts.push(conflict);
  }
  // Blocks EXIT from the document can also be contested (they told me
  // deleted a block that I had modified): they no longer have room in
  // order, but they have their place in the banner.
  for (const [key, decision] of decisions) {
    if (decision.conflict && !placed.has(key)) conflicts.push(decision.conflict);
  }

  const doc: PageDocJSON = { ...server, content };
  return { doc, conflicts, changed: !sameNode(doc, server) };
}

/* ─── Catering ──────────────────────────── ──────────────────────────── */

/**
 * Returns MY version of a contested block to the merged document.
 *
 * This is the gesture of the blindfold, and it is explicit by construction: the fusion
 * has retained the remote version, the user sees which one and decides. A block
 * of which my gesture was a deletion leaves the document; a block that the
 * remote deleted returns to its original place, calculated on the document
 * merged rather than on a fixed index — other restorations were able to pass
 * Before.
 */
export function applyRestore(
  doc: PageDocJSON,
  conflict: PageBlockConflict,
  mineOrder: PageDocJSON | null | undefined
): PageDocJSON {
  const blocks = topLevel(doc);
  const at = blocks.findIndex((node, index) => blockKey(node, index) === conflict.id);

  if (conflict.mine === null) {
    if (at === -1) return doc;
    return { ...doc, content: [...blocks.slice(0, at), ...blocks.slice(at + 1)] };
  }

  if (at !== -1) {
    const content = [...blocks];
    content[at] = conflict.mine;
    return { ...doc, content };
  }

  // The block is no longer there: the remote had deleted it. We put it back behind
  // the neighbor on the left that he had at my house.
  const mineKeys = indexBlocks(mineOrder).keys;
  const position = mineKeys.indexOf(conflict.id);
  let insertAt = 0;
  for (let j = position - 1; j >= 0; j -= 1) {
    const anchor = blocks.findIndex(
      (node, index) => blockKey(node, index) === mineKeys[j]
    );
    if (anchor !== -1) {
      insertAt = anchor + 1;
      break;
    }
  }
  return {
    ...doc,
    content: [...blocks.slice(0, insertAt), conflict.mine, ...blocks.slice(insertAt)],
  };
}
